import type { PlatformConfig } from '~platforms/config';

export type MediaAttachOutcome = 'attached' | 'failed' | 'unsupported';

export function dataUrlToFile(dataUrl: string, filename: string): File {
  const [header, payload = ''] = dataUrl.split(',');
  const mime = header.match(/:(.*?);/)?.[1] ?? 'image/png';
  const bytes = atob(payload);
  const buffer = new Uint8Array(bytes.length);
  for (let index = 0; index < bytes.length; index += 1) {
    buffer[index] = bytes.charCodeAt(index);
  }
  return new File([buffer], filename, { type: mime });
}

function findFileInput(platform: PlatformConfig): HTMLInputElement | null {
  const selector = platform.mediaReply?.fileInput;
  return selector ? document.querySelector<HTMLInputElement>(selector) : null;
}

/**
 * Hands an image or video to the page's own file input, as if the user picked
 * it. Nothing is posted. A site without an upload control for replies is
 * `unsupported`; one whose control could not be found is `failed`, and the
 * caller offers the file another way.
 */
export async function attachMediaToComposer(
  platform: PlatformConfig | null,
  dataUrl: string,
  filename: string,
): Promise<MediaAttachOutcome> {
  const media = platform?.mediaReply;
  const isVideo = filename.endsWith('.mp4');
  if (!platform || !media || !(isVideo ? media.video : media.image)) {
    return 'unsupported';
  }

  let input = findFileInput(platform);
  if (!input && media.mediaButton) {
    document.querySelector<HTMLElement>(media.mediaButton)?.click();
    await new Promise((resolve) => setTimeout(resolve, media.openDelayMs));
    input = findFileInput(platform);
  }
  if (!input) {
    return 'failed';
  }

  const transfer = new DataTransfer();
  transfer.items.add(dataUrlToFile(dataUrl, filename));
  input.files = transfer.files;
  input.dispatchEvent(new Event('change', { bubbles: true }));
  return 'attached';
}
