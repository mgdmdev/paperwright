/** Pulls the first JSON object out of a completion, tolerating code fences and chatter around it. */
export function extractJson(text: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  const candidate = (fenced ? fenced[1] : text) ?? '';
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) throw new Error('The answer contains no JSON object');
  return JSON.parse(candidate.slice(start, end + 1));
}
