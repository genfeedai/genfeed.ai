const JSON_SCRIPT_ESCAPE_LOOKUP: Record<string, string> = {
  '&': '\\u0026',
  '<': '\\u003c',
  '>': '\\u003e',
  '\u2028': '\\u2028',
  '\u2029': '\\u2029',
};

const JSON_SCRIPT_ESCAPE_PATTERN = /[<>&\u2028\u2029]/g;

export function stringifyJsonLd(value: unknown): string {
  const serialized = JSON.stringify(value);

  if (serialized === undefined) {
    throw new TypeError('stringifyJsonLd expects a JSON-serializable value');
  }

  return serialized.replace(
    JSON_SCRIPT_ESCAPE_PATTERN,
    (character) => JSON_SCRIPT_ESCAPE_LOOKUP[character],
  );
}
