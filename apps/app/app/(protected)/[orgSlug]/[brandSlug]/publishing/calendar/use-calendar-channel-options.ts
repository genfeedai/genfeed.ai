import { formatPlatformLabel } from '@genfeedai/contracts';
import { normalizePostingTimes } from '@genfeedai/contracts/api-types/contracts/credential-posting-times.contract';
import type { ReleaseCalendarFilterOption } from '@props/publisher/release-calendar.props';
import { useMemo } from 'react';
import type { CalendarChannelOptionsInput } from '@/features/posts/props/content-calendar-controller.props';

export function useCalendarChannelOptions({
  credentials,
  credentialIds,
}: CalendarChannelOptionsInput) {
  const credentialOptions: ReleaseCalendarFilterOption[] = useMemo(
    () =>
      credentials.map((credential) => ({
        label:
          credential.label ||
          credential.externalName ||
          credential.externalHandle ||
          (formatPlatformLabel(credential.platform) ?? credential.platform),
        platform: credential.platform,
        value: credential.id,
      })),
    [credentials],
  );

  const preferredTimes = useMemo(() => {
    const visibleCredentials = credentialIds.length
      ? credentials.filter((credential) =>
          credentialIds.includes(credential.id),
        )
      : credentials;
    return normalizePostingTimes(
      visibleCredentials.flatMap((credential) => credential.postingTimes ?? []),
    );
  }, [credentials, credentialIds]);

  const platformOptions: ReleaseCalendarFilterOption[] = useMemo(() => {
    const seen = new Map<string, ReleaseCalendarFilterOption>();
    for (const credential of credentials) {
      if (!seen.has(credential.platform)) {
        seen.set(credential.platform, {
          label:
            formatPlatformLabel(credential.platform) ?? credential.platform,
          platform: credential.platform,
          value: credential.platform,
        });
      }
    }

    return [...seen.values()];
  }, [credentials]);

  return { credentialOptions, platformOptions, preferredTimes };
}
