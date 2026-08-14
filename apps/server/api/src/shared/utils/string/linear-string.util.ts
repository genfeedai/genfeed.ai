export function isAsciiDigitCode(code: number): boolean {
  return code >= 48 && code <= 57;
}

function isAsciiUppercaseCode(code: number): boolean {
  return code >= 65 && code <= 90;
}

function isAsciiLowercaseCode(code: number): boolean {
  return code >= 97 && code <= 122;
}

function isAsciiLetterCode(code: number): boolean {
  return isAsciiUppercaseCode(code) || isAsciiLowercaseCode(code);
}

export function isAsciiWordCharacter(character: string): boolean {
  const code = character.charCodeAt(0);
  return isAsciiDigitCode(code) || isAsciiLetterCode(code) || code === 95;
}

function skipMatchingPrefix(
  value: string,
  character: string,
  start: number,
  end: number,
): number {
  while (start < end && value[start] === character) {
    start += 1;
  }

  return start;
}

function skipMatchingSuffix(
  value: string,
  character: string,
  start: number,
  end: number,
): number {
  while (end > start && value[end - 1] === character) {
    end -= 1;
  }

  return end;
}

export function trimTrailingCharacter(
  value: string,
  character: string,
): string {
  const end = skipMatchingSuffix(value, character, 0, value.length);
  return end === value.length ? value : value.slice(0, end);
}

export function trimCharacter(value: string, character: string): string {
  const start = skipMatchingPrefix(value, character, 0, value.length);
  const end = skipMatchingSuffix(value, character, start, value.length);
  return start === 0 && end === value.length ? value : value.slice(start, end);
}

export function replaceCharacterRuns(
  value: string,
  shouldReplace: (character: string) => boolean,
  replacement: string,
): string {
  const result: string[] = [];
  let replacing = false;

  for (const character of value) {
    if (shouldReplace(character)) {
      if (!replacing) {
        result.push(replacement);
        replacing = true;
      }
      continue;
    }

    result.push(character);
    replacing = false;
  }

  return result.join('');
}
