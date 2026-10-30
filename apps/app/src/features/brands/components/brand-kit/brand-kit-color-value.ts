const HEX_COLOR_6 = /^#[\da-f]{6}$/iu;
const HEX_COLOR_3 = /^#[\da-f]{3}$/iu;

export function isBrandKitHexColor(value: string): boolean {
  const trimmed = value.trim();
  return HEX_COLOR_6.test(trimmed) || HEX_COLOR_3.test(trimmed);
}

export function toColorPickerValue(value: string): string {
  const trimmed = value.trim();
  if (HEX_COLOR_6.test(trimmed)) {
    return trimmed.toLowerCase();
  }
  if (HEX_COLOR_3.test(trimmed)) {
    const [, red, green, blue] = trimmed;
    return `#${red}${red}${green}${green}${blue}${blue}`.toLowerCase();
  }
  return '#000000';
}
