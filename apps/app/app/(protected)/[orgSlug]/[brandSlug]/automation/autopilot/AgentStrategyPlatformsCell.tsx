'use client';

import type { ICredential } from '@genfeedai/contracts/interfaces';
import { getPlatformIcon } from '@genfeedai/helpers/ui/platform-icon/platform-icon.helper';
import type { AgentStrategyPlatformsCellProps } from '@props/automation/agent-strategy-platforms-cell.props';
import { Avatar, AvatarFallback, AvatarImage } from '@ui/primitives/avatar';
import { useTranslations } from 'next-intl';

function findConnectedCredential(
  credentials: ICredential[],
  platform: string,
): ICredential | undefined {
  const key = platform.toLowerCase();
  return credentials.find(
    (credential) =>
      credential.isConnected &&
      String(credential.platform).toLowerCase() === key,
  );
}

/**
 * Platform icons for a policy; when the brand has a connected account on that
 * platform the account avatar and handle ride along so the row answers
 * "which account will this post to?" without opening the policy.
 */
export default function AgentStrategyPlatformsCell({
  credentials,
  platforms,
}: AgentStrategyPlatformsCellProps) {
  const translate = useTranslations('pages.autopilot.platformsCell');
  if (platforms.length === 0) {
    return <span className="text-sm text-muted-foreground">—</span>;
  }
  return (
    <ul className="flex flex-wrap items-center gap-2">
      {platforms.map((platform) => {
        const credential = findConnectedCredential(credentials, platform);
        const handle =
          credential?.externalHandle?.replace(/^@/, '') ??
          credential?.externalName ??
          null;
        const label = credential
          ? translate('connected', { handle: handle ?? platform, platform })
          : translate('notConnected', { platform });
        return (
          <li
            key={platform}
            className="flex items-center gap-1.5 text-sm"
            title={label}
          >
            {getPlatformIcon(platform, 'size-4')}
            {credential ? (
              <>
                <Avatar className="size-5">
                  {credential.externalAvatar ? (
                    <AvatarImage
                      src={credential.externalAvatar}
                      alt={handle ?? platform}
                    />
                  ) : null}
                  <AvatarFallback className="text-2xs">
                    {(handle ?? platform).slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                {handle ? (
                  <span className="text-foreground/80">@{handle}</span>
                ) : null}
              </>
            ) : (
              <span className="sr-only">{label}</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
