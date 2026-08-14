const METRIC_SUFFIX_CHARACTERS = new Set([
  '%',
  'K',
  'M',
  'B',
  'T',
  'k',
  'm',
  'b',
  't',
]);

function isMetricSuffixCharacter(character: string): boolean {
  return METRIC_SUFFIX_CHARACTERS.has(character);
}

export function extractMetricSuffix(template: string): string {
  let start = template.length;

  while (start > 0 && isMetricSuffixCharacter(template[start - 1])) {
    start -= 1;
  }

  return template.slice(start);
}

export function formatAnimatedValue(value: number, template: string): string {
  const suffix = extractMetricSuffix(template);
  const hasDecimals = /\.\d/.test(template);
  const precision = hasDecimals ? 1 : 0;
  return `${value.toFixed(precision)}${suffix}`;
}
