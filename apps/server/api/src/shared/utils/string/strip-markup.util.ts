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

function stripBlockedElements(value: string): string {
  const output: string[] = [];
  let blockName: (typeof BLOCK_ELEMENT_NAMES)[number] | undefined;
  let blockStart = -1;
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

    if (!blockName) {
      const nextBlockName = getBlockElementName(tagContent);
      if (nextBlockName) {
        output.push(value.slice(copyStart, tagStart));
        blockName = nextBlockName;
        blockStart = tagStart;
      }
    } else if (tagContent.toLowerCase() === `/${blockName}`) {
      blockName = undefined;
      blockStart = -1;
      copyStart = tagEnd + 1;
    }

    cursor = tagEnd + 1;
  }

  if (blockName && blockStart >= 0) {
    output.push(value.slice(blockStart));
  } else {
    output.push(value.slice(copyStart));
  }

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
