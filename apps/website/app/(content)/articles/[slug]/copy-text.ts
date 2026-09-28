import { ClipboardService } from '@services/core/clipboard.service';

/**
 * Copy text on a click. Imported statically so the clipboard write starts
 * inside the click's user activation (Safari drops it across an awaited
 * import); the service itself loads its toast library only after the write.
 */
export async function copyText(text: string): Promise<void> {
  await ClipboardService.getInstance().copyToClipboard(text);
}
