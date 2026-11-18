'use client';
import { useConnectGenfeedStatus } from '@app/(protected)/home/use-connect-genfeed-status';
import { useBrand } from '@contexts/user/brand-context/brand-context';
import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import type { ConnectGenfeedClient } from '@genfeedai/contracts/interfaces';
import { buildConnectGenfeedInstructions } from '@genfeedai/helpers/integrations/connect-genfeed.helper';
import { deriveClaudeMcpResourceIdentifier } from '@genfeedai/helpers/integrations/mcp-resource.helper';
import { EnvironmentService } from '@services/core/environment.service';
import { logger } from '@services/core/logger.service';
import { Alert, AlertDescription, AlertTitle } from '@ui/primitives/alert';
import { Button } from '@ui/primitives/button';
import { OptionTile, OptionTileGroup } from '@ui/primitives/option-tile';
import { Pre } from '@ui/primitives/pre';
import { StatusDot } from '@ui/primitives/status-dot';
import { Clipboard } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import type { FirstDraftsAgentProps } from '@/features/onboarding/props/first-drafts.props';

export const ONBOARDING_AGENT_CLIENTS: readonly ConnectGenfeedClient[] = [
  'claude-code',
  'codex',
  'generic',
];

/** How often the step re-reads whether the agent has reached Genfeed. */
const CONNECTION_POLL_MS = 4000;

export default function AgentStep({
  client,
  onClientChange,
}: FirstDraftsAgentProps) {
  const t = useTranslations('pages.onboarding.firstDrafts');
  const { organizationId } = useBrand();
  const [isCopied, setIsCopied] = useState(false);
  const [hasCopyFailed, setHasCopyFailed] = useState(false);
  const status = useConnectGenfeedStatus(organizationId ?? '', {
    pollIntervalMs: CONNECTION_POLL_MS,
  });
  const endpoint =
    client === 'claude-code'
      ? deriveClaudeMcpResourceIdentifier(EnvironmentService.mcpEndpoint)
      : EnvironmentService.mcpEndpoint;
  const instructions = buildConnectGenfeedInstructions(client, endpoint);
  const setup = instructions.primaryCommand ?? endpoint;
  const clientLabel = t(`agent.clients.${client}.label`);
  const connection =
    status.status === 'configured' ? status.connections[0] : undefined;

  async function copySetup() {
    try {
      await navigator.clipboard.writeText(setup);
      setIsCopied(true);
      setHasCopyFailed(false);
    } catch (error) {
      logger.error('Failed to copy the agent setup command', error);
      setHasCopyFailed(true);
    }
  }

  return (
    <section className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold">{t('agent.title')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t('agent.description')}
        </p>
      </div>
      <OptionTileGroup
        ariaLabel={t('agent.clientLabel')}
        columns={2}
        onValueChange={(value) => {
          setIsCopied(false);
          onClientChange(value as ConnectGenfeedClient);
        }}
        value={client}
      >
        {ONBOARDING_AGENT_CLIENTS.map((item) => (
          <OptionTile
            description={t(`agent.clients.${item}.description`)}
            key={item}
            title={t(`agent.clients.${item}.label`)}
            value={item}
          />
        ))}
      </OptionTileGroup>
      <Pre>
        <code>{setup}</code>
      </Pre>
      <div className="flex flex-wrap items-center gap-3">
        <Button
          icon={<Clipboard aria-hidden="true" className="size-4" />}
          onClick={() => void copySetup()}
          size={ButtonSize.SM}
          variant={ButtonVariant.SECONDARY}
          withWrapper={false}
        >
          {isCopied
            ? t('agent.copied')
            : t(
                instructions.primaryCommand
                  ? 'agent.copyCommand'
                  : 'agent.copyAddress',
              )}
        </Button>
        <p className="text-sm text-muted-foreground">
          {instructions.authorizationInstruction}
        </p>
      </div>
      {hasCopyFailed && (
        <p role="alert" className="text-sm text-destructive">
          {t('agent.copyFailed')}
        </p>
      )}
      {connection ? (
        <Alert variant="success">
          <AlertTitle>
            {t('agent.connectedTitle', {
              client: connection.clientName ?? clientLabel,
            })}
          </AlertTitle>
          <AlertDescription>{t('agent.connectedDescription')}</AlertDescription>
        </Alert>
      ) : (
        <p
          role="status"
          className="flex items-center gap-2 text-sm text-muted-foreground"
        >
          <StatusDot isPulsing tone="info" />
          {t('agent.waiting', { client: clientLabel })}
        </p>
      )}
      {status.status === 'error' && !connection && (
        <p className="text-sm text-muted-foreground">
          {t('agent.statusError')}
        </p>
      )}
    </section>
  );
}
