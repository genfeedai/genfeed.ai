'use client';

import type { ConnectAccountModalProps } from '@props/pages/brand-integrations.props';
import ConnectAccountShell from './connect-account/ConnectAccountShell';
import ConnectTile from './connect-account/ConnectTile';
import { getConnectKey } from './connect-account/connect-account.util';

/** Platforms as a categorised grid of tiles; connected ones show their avatars. */
export default function ConnectAccountModal(props: ConnectAccountModalProps) {
  const { platformConnections, platformGroups, ...shell } = props;

  return (
    <ConnectAccountShell groups={platformGroups} {...shell}>
      {(visibleGroups) => (
        <div className="flex flex-col gap-5">
          {visibleGroups.map((group) => (
            <section className="flex flex-col gap-2" key={group.id}>
              <h3 className="text-xs font-medium text-muted-foreground">
                {group.label}
              </h3>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {group.platforms.map((item) => (
                  <ConnectTile
                    connectingPlatform={shell.connectingPlatform}
                    connections={platformConnections[item.platform] ?? []}
                    item={item}
                    key={getConnectKey(item)}
                    onConnect={shell.onConnect}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </ConnectAccountShell>
  );
}
