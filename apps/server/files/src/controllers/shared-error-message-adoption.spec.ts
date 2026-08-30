import { readFileSync } from 'node:fs';

const errorMessageAdoptionSites = [
  {
    fallbacks: [
      'Failed to process video',
      'Failed to process image',
      'Failed to process file',
      'Failed to process YouTube upload',
      'Failed to process hook remix',
      'Failed to get job status',
      'Failed to get queue statistics',
    ],
    file: './files.controller.ts',
  },
  {
    fallbacks: [
      'Failed to generate thumbnail',
      'Failed to resize image',
      'Failed to split image',
      'Failed to inspect video QA',
    ],
    file: './files-processing.controller.ts',
  },
  {
    fallbacks: [
      'Unknown error',
      'Failed to download file from URL:',
      'File does not exist or is not readable.',
      'Failed to get file metadata',
    ],
    file: './files-metadata.controller.ts',
  },
  {
    fallbacks: [
      'Failed to upload file',
      'Unknown error',
      'Failed to download file',
      'Failed to generate presigned upload URL',
      'Failed to generate presigned download URL',
    ],
    file: './files-storage.controller.ts',
  },
] as const;

describe('files controllers shared error-message adoption', () => {
  it.each(errorMessageAdoptionSites)(
    '$file uses the shared extractor without changing fallback text',
    ({ fallbacks, file }) => {
      const source = readFileSync(new URL(file, import.meta.url), 'utf8');

      expect(source).toContain(
        "import { getErrorMessage } from '@libs/utils/error/get-error-message.util';",
      );
      expect(source).not.toMatch(/\(error as Error\)\??\.message/);
      expect(source).not.toMatch(/parsedError\?\.message/);
      expect(source).not.toMatch(
        /(?:error|cleanupError) instanceof Error[\s\S]{0,80}?\.message/,
      );
      for (const fallback of fallbacks) {
        expect(source).toContain(fallback);
      }
    },
  );
});
