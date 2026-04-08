import { IS_SELF_HOSTED } from '@genfeedai/config';

import { LocalStorageProvider } from './local-storage.provider';
import { S3StorageProvider } from './s3-storage.provider';
import type { StorageProvider } from './storage.provider';

export function createStorageProvider(): StorageProvider {
  if (IS_SELF_HOSTED) {
    return new LocalStorageProvider();
  }
  return new S3StorageProvider();
}
