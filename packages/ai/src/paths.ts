/** Every dotted path a data object offers, arrays reduced to the shape of their first element. */
export function dataPaths(value: unknown, prefix = '', out: string[] = []): string[] {
  if (Array.isArray(value)) {
    if (prefix) out.push(`${prefix}[]`);
    if (value.length) dataPaths(value[0], prefix, out);
    return out;
  }
  if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) dataPaths(v, prefix ? `${prefix}.${k}` : k, out);
    return out;
  }
  if (prefix) out.push(prefix);
  return out;
}
