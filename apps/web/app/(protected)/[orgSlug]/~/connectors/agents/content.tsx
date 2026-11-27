'use client';

import { CardPadding } from '@genfeedai/contracts';
import { CONNECT_CLIENTS } from '@genfeedai/helpers/integrations/connect-genfeed-clients.helper';
import { buildConnectSetupGuide } from '@genfeedai/helpers/integrations/connect-genfeed-setup-guide.helper';
import { EnvironmentService } from '@services/core/environment.service';
import Card from '@ui/card/Card';
import ConnectSetupGuide from '@ui/feedback/connect-setup-guide/ConnectSetupGuide';
import { useSearchParams } from 'next/navigation';
import {
  CONNECTORS_AGENT_PARAM,
  DEFAULT_CONNECTORS_AGENT,
} from '@/config/connectors-menu-items.config';

/**
 * One agent's setup steps, picked from the Connectors sidebar. The steps are
 * the ones the MCP setup page shows for the same agent: both read
 * `CONNECT_CLIENTS` and `buildConnectSetupGuide`, so they never differ.
 */
export default function ConnectorsAgentsContent() {
  const requested = useSearchParams().get(CONNECTORS_AGENT_PARAM);
  const client =
    CONNECT_CLIENTS.find((entry) => entry.id === requested)?.id ??
    DEFAULT_CONNECTORS_AGENT;
  const guide = buildConnectSetupGuide(client, {
    connectUrl: `${EnvironmentService.apps.app}/connectors`,
    mcpUrl: EnvironmentService.mcpEndpoint,
  });

  return (
    <Card padding={CardPadding.LG}>
      <ConnectSetupGuide guide={guide} />
    </Card>
  );
}
