/** Public release metadata has no entity identity or tenant relationships. */
export function serializeLatestRelease(value: unknown) {
  if (
    typeof value !== 'object' ||
    value === null ||
    !('tag_name' in value) ||
    typeof value.tag_name !== 'string' ||
    !/^v\d+\.\d+\.\d+$/.test(value.tag_name) ||
    !('draft' in value) ||
    value.draft !== false ||
    !('prerelease' in value) ||
    value.prerelease !== false
  ) {
    throw new Error('Invalid stable release');
  }
  return {
    tag: value.tag_name,
    url: `https://github.com/genfeedai/genfeed.ai/releases/tag/${encodeURIComponent(value.tag_name)}`,
    version: value.tag_name.slice(1),
  };
}
