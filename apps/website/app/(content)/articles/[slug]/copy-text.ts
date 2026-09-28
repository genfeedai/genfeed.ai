/**
 * Copy text on a click. The clipboard service, and the toast library behind
 * its notifications, load on first use instead of with every article.
 */
export async function copyText(text: string): Promise<void> {
  const { ClipboardService } = await import('@services/core/clipboard.service');
  await ClipboardService.getInstance().copyToClipboard(text);
}
