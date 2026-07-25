import path from 'node:path';

/** Canonical root for files-service scratch artifacts. */
export const FILES_TMP_ROOT = path.resolve(process.cwd(), 'public', 'tmp');
