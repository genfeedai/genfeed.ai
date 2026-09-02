import { PostStatus, TargetExecutionState } from '@genfeedai/enums';
import type { IReleaseGroup } from '@genfeedai/interfaces';
import { getPublishingPostsHref } from '@helpers/content/posts.helper';
import { resolveAccountLabel } from './account-label.util';

/** Used when a FAILED target somehow carries no structured error. */
export const UNKNOWN_ERROR_CODE = 'UNKNOWN';

export interface BlockedTargetGroup {
  accounts: string[];
  code: string;
  count: number;
  href: string;
  message: string;
}

/**
 * Groups every FAILED channel target by its `error.code` so an operator sees
 * "3 blocked by RATE_LIMITED" instead of an undifferentiated failure count.
 * The group link filters the Posts list by failed status, and additionally by
 * platform when every target in the group shares one platform — the existing
 * route helpers have no error-code or credential filter, so that is the
 * closest honest link available.
 */
export function buildBlockedTargetGroups(
  releases: IReleaseGroup[],
): BlockedTargetGroup[] {
  const groupsByCode = new Map<
    string,
    {
      accounts: Set<string>;
      count: number;
      message: string;
      platforms: Set<string>;
    }
  >();

  for (const release of releases) {
    for (const target of release.targets ?? []) {
      if (target.executionState !== TargetExecutionState.FAILED) {
        continue;
      }

      const code = target.error?.code ?? UNKNOWN_ERROR_CODE;
      const existing = groupsByCode.get(code) ?? {
        accounts: new Set<string>(),
        count: 0,
        message: target.error?.message ?? '',
        platforms: new Set<string>(),
      };

      existing.count += 1;
      existing.accounts.add(
        resolveAccountLabel(target.credential, target.platform),
      );
      existing.platforms.add(target.platform);

      groupsByCode.set(code, existing);
    }
  }

  return Array.from(groupsByCode.entries())
    .map(([code, group]) => {
      const platforms = Array.from(group.platforms);
      return {
        accounts: Array.from(group.accounts),
        code,
        count: group.count,
        href: getPublishingPostsHref({
          platform: platforms.length === 1 ? platforms[0] : undefined,
          status: PostStatus.FAILED,
        }),
        message: group.message,
      };
    })
    .sort((left, right) => right.count - left.count);
}
