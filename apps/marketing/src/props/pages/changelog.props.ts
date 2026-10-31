import type { PublishedRelease } from '@genfeedai/contracts/interfaces/system/app-build.interface';

export interface ChangelogProps {
  /** True when the releases source failed, as opposed to returning no releases. */
  isUnavailable?: boolean;
  releases: PublishedRelease[];
}
