import { createHash } from 'node:crypto';
export function storyboardConfigHash(value: unknown): string {
  function canonical(item: unknown): string {
    if (item === null || typeof item !== 'object')
      return JSON.stringify(item) ?? 'null';
    if (Array.isArray(item)) return `[${item.map(canonical).join(',')}]`;
    return `{${Object.entries(item)
      .filter(([, value]) => value !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${JSON.stringify(key)}:${canonical(value)}`)
      .join(',')}}`;
  }
  return createHash('sha256').update(canonical(value)).digest('hex');
}
