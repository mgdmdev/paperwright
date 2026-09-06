import { migrateModel, resolveDocument, validateModel } from '@paperwright/model';
import type { DocumentModel, RenderData, ValidationIssue } from '@paperwright/model';
import type { LlmClient, Message } from './client';
import { AUTHORING_GUIDE, templateJsonSchema } from './guide';
import { extractJson } from './json';
import { dataPaths } from './paths';

export interface AssetHint {
  hash: string;
  mime: string;
  /** What the picture is, so the model knows where it belongs: "company logo", "director's signature". */
  description: string;
}

export interface GenerateOptions {
  client: LlmClient;
  /** What the document is, in the user's words. */
  prompt: string;
  /** Data the template should bind to; its paths are offered to the model. */
  sampleData?: RenderData;
  assets?: AssetHint[];
  locale?: string;
  /** Validation rounds before giving up. Each failed round sends the issues back. */
  attempts?: number;
}

export interface GenerateResult {
  model: DocumentModel;
  /** Rounds used, 1 when the first answer validated. */
  attempts: number;
  /** Issues the model was asked to fix along the way, per round. */
  repairs: ValidationIssue[][];
}

export class GenerationError extends Error {
  constructor(
    message: string,
    readonly repairs: ValidationIssue[][],
    readonly lastAnswer: string,
  ) {
    super(message);
    this.name = 'GenerationError';
  }
}

const system = () => `${AUTHORING_GUIDE}\n\nThe JSON Schema of a template:\n${templateJsonSchema()}`;

const describeData = (sampleData: RenderData | undefined) =>
  sampleData && Object.keys(sampleData).length
    ? `\n\nBind to this data (paths; [] marks an array to repeat over or feed a dataTable):\n${dataPaths(sampleData).join('\n')}`
    : '\n\nNo data was given: choose sensible paths and bind to them.';

const describeAssets = (assets: AssetHint[] | undefined) =>
  assets?.length
    ? `\n\nImages available, by asset hash (list the ones you use under "assets" with their mime):\n${assets.map((a) => `- ${a.hash} (${a.mime}): ${a.description}`).join('\n')}`
    : '\n\nNo images are available: do not add image blocks or captured signatures.';

/** Runs an answer → validate → repair loop until a template validates or the attempts run out. */
async function converge(client: LlmClient, messages: Message[], attempts: number): Promise<GenerateResult> {
  const repairs: ValidationIssue[][] = [];
  let answer = '';
  for (let round = 1; round <= attempts; round++) {
    answer = await client.complete({ system: system(), messages, json: true });
    let parsed: unknown;
    try {
      parsed = extractJson(answer);
    } catch (e) {
      const issue = { path: '', message: e instanceof Error ? e.message : String(e) };
      repairs.push([issue]);
      messages.push({ role: 'assistant', content: answer }, { role: 'user', content: `That was not a JSON object (${issue.message}). Answer with the JSON template only.` });
      continue;
    }
    const result = validateModel(parsed);
    if (result.ok) return { model: migrateModel(result.model), attempts: round, repairs };
    repairs.push(result.issues);
    messages.push(
      { role: 'assistant', content: answer },
      { role: 'user', content: `The template failed validation. Fix every issue and return the whole corrected template:\n${result.issues.map((i) => `- ${i.path || '(root)'}: ${i.message}`).join('\n')}` },
    );
  }
  throw new GenerationError(`No valid template after ${attempts} attempts`, repairs, answer);
}

/** A template from a description. */
export async function generateTemplate(options: GenerateOptions): Promise<GenerateResult> {
  const { client, prompt, sampleData, assets, locale = 'en-GB', attempts = 3 } = options;
  const messages: Message[] = [
    {
      role: 'user',
      content: `Write a template for: ${prompt}\n\nLocale: ${locale}.${describeData(sampleData)}${describeAssets(assets)}`,
    },
  ];
  return converge(client, messages, attempts);
}

export interface EditOptions {
  client: LlmClient;
  model: DocumentModel;
  /** "Move the totals under the table and make the invoice number red." */
  instruction: string;
  sampleData?: RenderData;
  assets?: AssetHint[];
  attempts?: number;
}

/** The same template with an instruction applied; ids of untouched blocks are kept. */
export async function editTemplate(options: EditOptions): Promise<GenerateResult> {
  const { client, model, instruction, sampleData, assets, attempts = 3 } = options;
  const messages: Message[] = [
    {
      role: 'user',
      content: `Here is a template:\n${JSON.stringify(model)}\n\nApply this change and return the whole template, keeping the ids of blocks you do not change: ${instruction}${describeData(sampleData)}${describeAssets(assets)}`,
    },
  ];
  return converge(client, messages, attempts);
}

export interface SampleDataOptions {
  client: LlmClient;
  model: DocumentModel;
  /** Anything that should shape the values: "a Ghanaian retail customer", "three line items". */
  hint?: string;
  attempts?: number;
}

export interface SampleDataResult {
  data: RenderData;
  attempts: number;
  /** Bindings the data still leaves empty, if any remained after the attempts. */
  unresolved: string[];
}

/** Data that makes every binding in a template resolve, checked with the real resolver. */
export async function suggestSampleData(options: SampleDataOptions): Promise<SampleDataResult> {
  const { client, model, hint, attempts = 3 } = options;
  const sys = `You produce realistic sample data for a paperwright template. Answer with one JSON object only. Arrays fed to repeat/dataTable blocks need two to four elements. Dates are ISO strings (YYYY-MM-DD), amounts are numbers, not formatted strings.`;
  const messages: Message[] = [
    { role: 'user', content: `Template:\n${JSON.stringify(model)}\n\nProduce data so that every {{ binding }}, dataTable rowBinding, repeat forEach and if test resolves to a value.${hint ? ` ${hint}` : ''}` },
  ];
  // Every resolver warning counts: a missing value, a non-array fed to a table or repeat, a
  // filter that failed on the value's shape. The path is what is reported; the full warning goes back.
  const PATHS = [/^No value for "(.*)"$/, /^Block "[^"]*": "(.*)" is not an array$/, /^Filter failed for "(.*)":/];
  const pathOf = (w: string) => PATHS.map((re) => re.exec(w)?.[1]).find((m): m is string => !!m) ?? w;
  const check = (candidate: RenderData) => {
    const { warnings } = resolveDocument({ model, data: candidate });
    return { warnings, unresolved: [...new Set(warnings.map(pathOf))] };
  };
  let data: RenderData = {};
  let unresolved = check(data).unresolved;
  for (let round = 1; round <= attempts; round++) {
    const answer = await client.complete({ system: sys, messages, json: true });
    let parsed: unknown;
    try {
      parsed = extractJson(answer);
    } catch (e) {
      messages.push({ role: 'assistant', content: answer }, { role: 'user', content: `That was not a JSON object (${e instanceof Error ? e.message : String(e)}). Answer with the JSON data only.` });
      continue;
    }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      messages.push({ role: 'assistant', content: answer }, { role: 'user', content: 'Answer with one JSON object whose keys are the data paths.' });
      continue;
    }
    data = parsed as RenderData;
    const result = check(data);
    unresolved = result.unresolved;
    if (unresolved.length === 0) return { data, attempts: round, unresolved };
    messages.push(
      { role: 'assistant', content: answer },
      { role: 'user', content: `These bindings still do not resolve; fix them (keeping everything else) and return the whole data object:\n${result.warnings.map((w) => `- ${w}`).join('\n')}` },
    );
  }
  return { data, attempts, unresolved };
}
