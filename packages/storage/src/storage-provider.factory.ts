import { isSelfHostedDeployment } from '@genfeedai/config';

import { LocalStorageProvider } from './local-storage.provider';
import { S3StorageProvider } from './s3-storage.provider';
import type {
  StorageProvider,
  StorageProviderOptions,
} from './storage.provider';

export function createStorageProvider(
  options: StorageProviderOptions = {},
): StorageProvider {
  if (isSelfHostedDeployment()) {
    return new LocalStorageProvider(options.baseDir);
  }
  return new S3StorageProvider(options);
}
