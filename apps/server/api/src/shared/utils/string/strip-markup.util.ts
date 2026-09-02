const BLOCK_ELEMENT_NAMES = ['script', 'style'] as const;

function findTagEnd(value: string, start: number): number {
  for (let index = start + 1; index < value.length; index += 1) {
    if (value[index] === '>') {
      return index;
    }
  }

  return -1;
}

function getBlockElementName(
  tagContent: string,
): (typeof BLOCK_ELEMENT_NAMES)[number] | undefined {
  const normalized = tagContent.toLowerCase();

  return BLOCK_ELEMENT_NAMES.find((name) => normalized.startsWith(name));
}

function matchesAsciiCaseInsensitive(
  value: string,
  start: number,
  expected: string,
): boolean {
  if (start + expected.length > value.length) {
    return false;
  }

  for (let offset = 0; offset < expected.length; offset += 1) {
    if (value[start + offset].toLowerCase() !== expected[offset]) {
      return false;
    }
  }

  return true;
}

function findBlockedElementEnd(
  value: string,
  blockName: (typeof BLOCK_ELEMENT_NAMES)[number],
  start: number,
): number {
  const closingTag = `</${blockName}>`;
  let cursor = start;

  while (cursor < value.length) {
    const tagStart = value.indexOf('<', cursor);
    if (tagStart < 0) {
      return -1;
    }

    if (matchesAsciiCaseInsensitive(value, tagStart, closingTag)) {
      return tagStart + closingTag.length;
    }

    cursor = tagStart + 1;
  }

  return -1;
}

function findNextCompleteTag(
  value: string,
  cursor: number,
): { tagEnd: number; tagStart: number } | undefined {
  const tagStart = value.indexOf('<', cursor);
  if (tagStart < 0) {
    return undefined;
  }

  const tagEnd = findTagEnd(value, tagStart);
  if (tagEnd < 0) {
    return undefined;
  }

  return { tagEnd, tagStart };
}

function stripBlockedElements(value: string): string {
  const output: string[] = [];
  let copyStart = 0;
  let cursor = 0;

  while (cursor < value.length) {
    const tag = findNextCompleteTag(value, cursor);
    if (!tag) {
      break;
    }

    const blockName = getBlockElementName(
      value.slice(tag.tagStart + 1, tag.tagEnd),
    );
    if (!blockName) {
      cursor = tag.tagEnd + 1;
      continue;
    }

    const blockEnd = findBlockedElementEnd(value, blockName, tag.tagEnd + 1);
    if (blockEnd < 0) {
      break;
    }

    output.push(value.slice(copyStart, tag.tagStart));
    copyStart = blockEnd;
    cursor = blockEnd;
  }

  output.push(value.slice(copyStart));
  return output.join('');
}

function replaceCompleteTag(
  input: string,
  replacement: string,
  output: string[],
  copyStart: number,
  tagStart: number,
  tagEnd: number,
): number {
  if (tagEnd <= tagStart + 1) {
    return copyStart;
  }

  output.push(input.slice(copyStart, tagStart), replacement);
  return tagEnd + 1;
}

export function replaceMarkup(
  value: string,
  replacement: string,
  removeBlockedElements = false,
): string {
  const input = removeBlockedElements ? stripBlockedElements(value) : value;
  const output: string[] = [];
  let copyStart = 0;
  let cursor = 0;

  while (cursor < input.length) {
    const tag = findNextCompleteTag(input, cursor);
    if (!tag) {
      break;
    }

    copyStart = replaceCompleteTag(
      input,
      replacement,
      output,
      copyStart,
      tag.tagStart,
      tag.tagEnd,
    );
    cursor = tag.tagEnd + 1;
  }

  output.push(input.slice(copyStart));
  return output.join('');
}
