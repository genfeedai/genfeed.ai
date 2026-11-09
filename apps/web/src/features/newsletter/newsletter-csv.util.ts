/** Save a CSV string as a file in the browser. */
export function downloadNewsletterCsv(csv: string, filename: string): void {
  const url = window.URL.createObjectURL(
    new Blob([csv], { type: 'text/csv;charset=utf-8' }),
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

/** Filename for an export: `<brand-slug>-subscribers-<yyyy-mm-dd>.csv`. */
export function newsletterExportFilename(brandSlug: string, now: Date): string {
  const slug = brandSlug.trim() || 'newsletter';
  return `${slug}-subscribers-${now.toISOString().slice(0, 10)}.csv`;
}
