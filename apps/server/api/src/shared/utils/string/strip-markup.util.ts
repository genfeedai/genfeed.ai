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

function stripBlockedElements(value: string): string {
  const output: string[] = [];
  let copyStart = 0;
  let cursor = 0;

  while (cursor < value.length) {
    const tagStart = value.indexOf('<', cursor);
    if (tagStart < 0) {
      break;
    }

    const tagEnd = findTagEnd(value, tagStart);
    if (tagEnd < 0) {
      break;
    }

    const tagContent = value.slice(tagStart + 1, tagEnd);
    const blockName = getBlockElementName(tagContent);
    if (!blockName) {
      cursor = tagEnd + 1;
      continue;
    }

    const blockEnd = findBlockedElementEnd(value, blockName, tagEnd + 1);
    if (blockEnd < 0) {
      break;
    }

    output.push(value.slice(copyStart, tagStart));
    copyStart = blockEnd;
    cursor = blockEnd;
  }

  output.push(value.slice(copyStart));
  return output.join('');
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
    const tagStart = input.indexOf('<', cursor);
    if (tagStart < 0) {
      break;
    }

    const tagEnd = findTagEnd(input, tagStart);
    if (tagEnd < 0) {
      break;
    }

    if (tagEnd > tagStart + 1) {
      output.push(input.slice(copyStart, tagStart), replacement);
      copyStart = tagEnd + 1;
    }

    cursor = tagEnd + 1;
  }

  output.push(input.slice(copyStart));
  return output.join('');
}
