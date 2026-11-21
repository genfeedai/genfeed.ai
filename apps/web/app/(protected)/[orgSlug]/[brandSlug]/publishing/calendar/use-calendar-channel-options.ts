import { formatPlatformLabel } from '@genfeedai/contracts';
import { normalizePostingTimes } from '@genfeedai/contracts/api-types/contracts/credential-posting-times.contract';
import { toConnectedAccount } from '@genfeedai/helpers/publisher/connected-account.helper';
import { getConnectedAccountText } from '@ui/display/connected-account/connected-account.util';
import { useMemo } from 'react';
import type { CalendarChannelOptionsInput } from '@/features/posts/props/content-calendar-controller.props';
import type { ReleaseCalendarFilterOption } from '@/props/publisher/release-calendar.props';

export function useCalendarChannelOptions({
  credentials,
  credentialIds,
}: CalendarChannelOptionsInput) {
  const credentialOptions: ReleaseCalendarFilterOption[] = useMemo(
    () =>
      credentials.map((credential) => {
        const account = toConnectedAccount(credential);
        return {
          account,
          label: getConnectedAccountText(account).primary,
          value: credential.id,
        };
      }),
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
