import { z } from 'zod';
import { documentModelSchema } from '@paperwright/model';

let cached: string | undefined;

/** The model's JSON Schema, as the contract handed to the language model. */
export function templateJsonSchema(): string {
  cached ??= JSON.stringify(z.toJSONSchema(documentModelSchema, { target: 'draft-2020-12', unrepresentable: 'any' }));
  return cached;
}

/**
 * What the schema cannot say: how bindings are written, which filters exist, how the document is
 * meant to be structured. Kept short; the schema carries the shapes.
 */
export const AUTHORING_GUIDE = `You write paperwright document templates: JSON documents that render to PDF the same way every time.

A template has page setup, an optional header and footer (repeated on every page), and a list of blocks. Units are PDF points (A4 is 595 x 842).

Bindings: any text can contain {{ path }} to insert a value from the data, with optional filters: {{ amount | currency:GHS }}, {{ date | date:long }}, {{ qty | number:0 }}, {{ name | upper }}, {{ name | lower }}, {{ po | default:"none" }}, {{ tags | join:", " }}. Date styles: short, medium, long, full, iso, time, datetime, month. Currency takes a three-letter code. Number takes min[,max] fraction digits.

Blocks and when to use them:
- heading (levels 1-6, optional align and keepWithNext), text (rich: spans with bold/italic/underline/link/color, align), list (bullet or numbered, items of spans), keyValue (label/value rows), divider.
- dataTable: one row per element of an array in the data; rowBinding is the bare path to the array (no braces); each column's cell is a template resolved against the row, e.g. "{{ description }}", "{{ amount | currency:GHS }}"; $number is the 1-based row number. table: fixed rows written in the template.
- repeat: repeats its blocks for each element of forEach (bare path), naming it as; if: shows then when {{ test }} has a value (test is a binding object {"var": "path"}), else otherwise.
- columns: blocks side by side, each column with an optional width fraction; section: a titled group; keepTogether: never split across pages; pageBreak.
- image and signature need an asset hash that exists in the template's assets list; never invent hashes. signature draws a signing line with signer name/title/date. qrcode encodes a value. watermark, pageNumber (format "Page {page} of {total}") go in the footer or header.
Rules: every block needs a unique id (short, kebab-case). Every date in the output goes through the date filter (e.g. {{ offer.startDate | date:long }}) and every money amount through currency; never print a raw ISO date or a bare number for money. Do not put pageBreak inside header, footer, columns or keepTogether. Use the given locale. Keep the design restrained: one h1, sections with h3 titles, tables for line items, keyValue for metadata. Use only the block types above and only fields the schema allows.
Answer with the JSON template only.`;
