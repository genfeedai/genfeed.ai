import { MAX_FILE_SIZE } from '@genfeedai/contracts/constants';
import { downloadBounded } from '@libs/security/bounded-download';

const VIDEO_EXTENSIONS: Readonly<Record<string, string>> = {
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/webm': 'webm',
  'video/ogg': 'ogv',
  'video/x-matroska': 'mkv',
};

/** Preserve the container when a stored object's URL has no filename extension. */
export async function downloadReplicateVideoFile(url: string): Promise<File> {
  const { data, headers } = await downloadBounded(url, {
    createError: (reason) =>
      new Error(
        reason === 'failed'
          ? 'The source video could not be downloaded for upscaling.'
          : 'The source video exceeds the 100 MB upload limit.',
      ),
    deadlineMs: 120_000,
    destination: { allowedSchemes: ['https:'] },
    maxBytes: MAX_FILE_SIZE,
    timeoutError: new Error('The source video download timed out.'),
  });
  const contentType = (headers.get('content-type') ?? '')
    .split(';')[0]
    .trim()
    .toLowerCase();
  const extension = VIDEO_EXTENSIONS[contentType];
  if (!extension) {
    throw new Error('The source video has no supported container MIME type.');
  }
  return new File([new Uint8Array(data)], `source.${extension}`, {
    type: contentType,
  });
}
