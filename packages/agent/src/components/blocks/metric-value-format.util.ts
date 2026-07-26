function isMetricSuffixCharacter(character: string): boolean {
  return (
    character === '%' ||
    character === 'K' ||
    character === 'M' ||
    character === 'B' ||
    character === 'T' ||
    character === 'k' ||
    character === 'm' ||
    character === 'b' ||
    character === 't'
  );
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
