export function parseLatestRelease(value: unknown) {
  if (
    typeof value !== 'object' ||
    value === null ||
    !('tag' in value) ||
    typeof value.tag !== 'string' ||
    !('version' in value) ||
    typeof value.version !== 'string' ||
    !('url' in value) ||
    typeof value.url !== 'string' ||
    value.url !==
      `https://github.com/genfeedai/genfeed.ai/releases/tag/${encodeURIComponent(value.tag)}`
  ) {
    throw new Error('Invalid release response');
  }
  return { tag: value.tag, url: value.url, version: value.version };
}

export function isNewerRelease(latest: string, current: string): boolean {
  const parse = (version: string) => {
    const match = /^v?(\d+)\.(\d+)\.(\d+)(?:-([\w.-]+))?(?:\+[\w.-]+)?$/.exec(
      version,
    );
    if (!match) throw new Error('Invalid version');
    return {
      parts: [BigInt(match[1]), BigInt(match[2]), BigInt(match[3])],
      prerelease: match[4],
    };
  };
  const a = parse(latest);
  const b = parse(current);
  for (let index = 0; index < 3; index += 1) {
    if (a.parts[index] !== b.parts[index])
      return a.parts[index] > b.parts[index];
  }
  return !a.prerelease && Boolean(b.prerelease);
}
