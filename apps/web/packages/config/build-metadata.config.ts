import type { AppBuildMetadata } from '@genfeedai/contracts/interfaces/system/app-build.interface';

export const BUILD_METADATA: AppBuildMetadata = Object.freeze({
  channel: 'main',
  commitSha: process.env.NEXT_PUBLIC_COMMIT_SHA ?? 'dev',
  releaseTag: process.env.NEXT_PUBLIC_RELEASE_TAG?.trim() || null,
  version: process.env.NEXT_PUBLIC_APP_VERSION ?? 'development',
});
