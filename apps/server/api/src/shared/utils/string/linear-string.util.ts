export function trimTrailingCharacter(
  value: string,
  character: string,
): string {
  let end = value.length;

  while (end > 0 && value[end - 1] === character) {
    end -= 1;
  }

  return end === value.length ? value : value.slice(0, end);
}

export function trimCharacter(value: string, character: string): string {
  let start = 0;
  let end = value.length;

  while (start < end && value[start] === character) {
    start += 1;
  }

  while (end > start && value[end - 1] === character) {
    end -= 1;
  }

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
