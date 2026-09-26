const RELEASE_DATE: Intl.DateTimeFormatOptions = {
  day: 'numeric',
  month: 'long',
  timeZone: 'UTC',
  year: 'numeric',
};

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function formatReleaseDate(publishedAt: string): string {
  return new Date(publishedAt).toLocaleDateString('en-US', RELEASE_DATE);
}

/** Drop the version heading the page already shows in the release row. */
export function releaseNotes(body: string, tag: string): string {
  const version = tag.replace(/^v/i, '');
  const escapedVersion = escapeRegExp(version);
  // Only a linked heading whose link text is this release's own version
  // (e.g. `## [0.1.76](...) - 2026-09-25`) is the duplicate row title. A
  // dated linked heading for something else, such as a migration guide,
  // must be kept.
  const linkedVersionTitle = new RegExp(
    `^\\s*##\\s+\\[v?${escapedVersion}\\]\\([^)\\s]+\\)\\s+-\\s+\\d{4}-\\d{2}-\\d{2}\\s*(?:\\n|$)`,
    'i',
  );
  const plainVersionTitle = new RegExp(
    `^\\s*##\\s+v?${escapedVersion}\\s*(?:\\n|$)`,
    'i',
  );
  return body
    .replace(linkedVersionTitle, '')
    .replace(plainVersionTitle, '')
    .trim();
}

export function releaseSummary(notes: string): string {
  const sections = [...notes.matchAll(/^###\s+(.+)$/gm)].map((match) =>
    match[1].trim(),
  );
  if (sections.length > 0) {
    const visible = sections.slice(0, 3);
    const extra = sections.length - visible.length;
    return extra > 0
      ? `${visible.join(' · ')} · +${extra}`
      : visible.join(' · ');
  }
  const changes = notes.match(/^(?:-|\*)\s+\S/gm)?.length ?? 0;
  if (changes === 0) return '';
  return changes === 1 ? '1 change' : `${changes} changes`;
}
