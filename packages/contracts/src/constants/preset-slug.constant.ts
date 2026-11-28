/**
 * The address segment of a catalog preset: its label as a person would type
 * it in a search box, lower case, words joined by hyphens ("UGC selfie ad" is
 * `ugc-selfie-ad`). The marketing site's `/presets/<slug>` page and the store
 * listing both derive it here from the label, so they never disagree.
 */
export function presetSlug(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
