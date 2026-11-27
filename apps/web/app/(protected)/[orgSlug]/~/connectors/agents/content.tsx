'use client';

import { CardPadding } from '@genfeedai/contracts';
import {
  CONNECT_CLIENTS,
  type ConnectClientTabId,
} from '@genfeedai/helpers/integrations/connect-genfeed-clients.helper';
import { buildConnectSetupGuide } from '@genfeedai/helpers/integrations/connect-genfeed-setup-guide.helper';
import { EnvironmentService } from '@services/core/environment.service';
import Card from '@ui/card/Card';
import ConnectClientMarks from '@ui/feedback/connect-client-marks/ConnectClientMarks';
import ConnectSetupGuide from '@ui/feedback/connect-setup-guide/ConnectSetupGuide';
import { OptionTile, OptionTileGroup } from '@ui/primitives/option-tile';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

/**
 * The same clients and steps as the MCP setup page: both read
 * `CONNECT_CLIENTS` and `buildConnectSetupGuide`, so they never differ.
 */
export default function ConnectorsAgentsContent() {
  const translate = useTranslations('pages.connectGenfeed');
  const [clientId, setClientId] = useState<ConnectClientTabId>('claude-code');
  const guide = buildConnectSetupGuide(clientId, {
    connectUrl: `${EnvironmentService.apps.app}/connectors`,
    mcpUrl: EnvironmentService.mcpEndpoint,
  });

  return (
    <div className="flex w-full flex-col gap-6">
      <OptionTileGroup
        ariaLabel={translate('clientLabel')}
        columns={3}
        onValueChange={(value) => setClientId(value as ConnectClientTabId)}
        value={clientId}
      >
        {CONNECT_CLIENTS.map((client) => (
          <OptionTile
            description={client.summary}
            icon={<ConnectClientMarks marks={client.marks} />}
            key={client.id}
            title={client.label}
            value={client.id}
          />
        ))}
      </OptionTileGroup>
      <Card padding={CardPadding.LG}>
        <ConnectSetupGuide guide={guide} />
      </Card>
    </div>
  );
}
