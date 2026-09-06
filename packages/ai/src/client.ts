/**
 * The one thing the host has to provide: a way to get a completion. Keys stay with the host.
 * Two adapters cover most services: Gemini's REST API, and the OpenAI chat-completions shape
 * that OpenAI, Groq, Mistral, OpenRouter, Ollama and others speak.
 */

export interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export interface CompletionRequest {
  system: string;
  messages: Message[];
  /** Ask the service for JSON output where it supports that; the text is parsed either way. */
  json?: boolean;
  temperature?: number;
}

export interface LlmClient {
  readonly name: string;
  complete(request: CompletionRequest): Promise<string>;
}

type Fetch = typeof fetch;

const fail = async (res: Response, service: string): Promise<never> => {
  const text = (await res.text()).slice(0, 400);
  throw new Error(`${service} answered ${res.status}: ${text}`);
};

export interface GeminiOptions {
  apiKey: string;
  /** e.g. gemini-flash-latest, gemini-2.5-flash */
  model?: string;
  baseUrl?: string;
  fetch?: Fetch;
}

export function gemini({ apiKey, model = 'gemini-flash-latest', baseUrl = 'https://generativelanguage.googleapis.com/v1beta', fetch: f = fetch }: GeminiOptions): LlmClient {
  return {
    name: `gemini:${model}`,
    async complete({ system, messages, json, temperature }) {
      const res = await f(`${baseUrl}/models/${model}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: messages.map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
          generationConfig: { ...(json ? { responseMimeType: 'application/json' } : {}), ...(temperature !== undefined ? { temperature } : {}) },
        }),
      });
      if (!res.ok) return fail(res, 'Gemini');
      const body = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
      const text = body.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
      if (!text) throw new Error('Gemini returned no text');
      return text;
    },
  };
}

export interface OpenAiCompatibleOptions {
  apiKey: string;
  model: string;
  /** e.g. https://api.openai.com/v1, https://api.groq.com/openai/v1, http://localhost:11434/v1 */
  baseUrl?: string;
  fetch?: Fetch;
}

export function openAiCompatible({ apiKey, model, baseUrl = 'https://api.openai.com/v1', fetch: f = fetch }: OpenAiCompatibleOptions): LlmClient {
  return {
    name: `openai:${model}`,
    async complete({ system, messages, json, temperature }) {
      const res = await f(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model,
          // Only when asked for: reasoning models refuse any value but their default.
          ...(temperature !== undefined ? { temperature } : {}),
          ...(json ? { response_format: { type: 'json_object' } } : {}),
          messages: [{ role: 'system', content: system }, ...messages],
        }),
      });
      if (!res.ok) return fail(res, 'The completion service');
      const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      const text = body.choices?.[0]?.message?.content ?? '';
      if (!text) throw new Error('The completion service returned no text');
      return text;
    },
  };
}

/** A client for tests and dry runs: answers from a script, in order. */
export function scripted(answers: string[], name = 'scripted'): LlmClient & { calls: CompletionRequest[] } {
  const calls: CompletionRequest[] = [];
  return {
    name,
    calls,
    async complete(request) {
      calls.push(request);
      const next = answers.shift();
      if (next === undefined) throw new Error('scripted client has no more answers');
      return next;
    },
  };
}
