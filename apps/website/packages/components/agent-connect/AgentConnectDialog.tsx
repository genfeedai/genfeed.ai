'use client';

import { type AgentClient, agentClients } from '@data/agent-clients.data';
import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import CommandBlock from '@public/agent-clients/agent-client-command-block';
import { AGENT_CONNECT_EVENT } from '@ui/buttons/connect-agent/connect-agent.event';
import { Modal } from '@ui/modals/compound';
import { Button } from '@ui/primitives/button';
import AgentClientLogo from '@web-components/content/AgentClientLogo';
import { ArrowLeft, ExternalLink } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

export default function AgentConnectDialog({
  openOnMount = false,
}: {
  openOnMount?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [client, setClient] = useState<AgentClient | null>(null);
  const trigger = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const show = () => {
      trigger.current =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
      setClient(
        agentClients.find(
          (option) =>
            window.location.pathname === `/${option.slug}` ||
            window.location.pathname.startsWith(`/${option.slug}/`),
        ) ?? null,
      );
      setOpen(true);
    };
    const showDeepLink = () => {
      if (
        window.location.pathname === '/agent' &&
        window.location.hash === '#connect'
      )
        show();
    };
    if (openOnMount) show();
    else showDeepLink();
    window.addEventListener(AGENT_CONNECT_EVENT, show);
    window.addEventListener('hashchange', showDeepLink);
    return () => {
      window.removeEventListener(AGENT_CONNECT_EVENT, show);
      window.removeEventListener('hashchange', showDeepLink);
    };
  }, [openOnMount]);

  function onOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (
      !nextOpen &&
      window.location.pathname === '/agent' &&
      window.location.hash === '#connect'
    ) {
      window.history.replaceState(
        window.history.state,
        '',
        `${window.location.pathname}${window.location.search}`,
      );
    }
  }

  return (
    <Modal.Root open={open} onOpenChange={onOpenChange}>
      <Modal.Content
        className="max-h-[90dvh] w-[calc(100%-2rem)] overflow-y-auto"
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          trigger.current?.focus();
        }}
        size="lg"
      >
        <Modal.Header className="pr-6 text-left">
          <Modal.Title>Connect your agent</Modal.Title>
          <Modal.Description>
            {client
              ? `Add Genfeed to ${client.name}.`
              : 'Choose the agent you already use. Add Genfeed, then approve the connection in your browser.'}
          </Modal.Description>
        </Modal.Header>
        <Modal.Body className="min-w-0 py-0">
          {client ? (
            <div className="space-y-5">
              <Button
                onClick={() => setClient(null)}
                size={ButtonSize.SM}
                variant={ButtonVariant.GHOST}
              >
                <ArrowLeft aria-hidden className="mr-2 size-4" />
                Choose another agent
              </Button>
              <div className="flex items-center gap-3">
                <AgentClientLogo client={client} />
                <h3 className="font-semibold">{client.name}</h3>
              </div>
              <p className="text-sm leading-6 text-surface/75">
                {client.connectInstruction}
              </p>
              {client.installation.destination ? (
                <Button asChild size={ButtonSize.PUBLIC}>
                  <a
                    href={client.installation.destination}
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    {client.installation.destinationLabel}
                    <ExternalLink aria-hidden className="ml-2 size-4" />
                  </a>
                </Button>
              ) : null}
              {client.installation.command ? (
                <CommandBlock
                  label={client.installation.method}
                  value={client.installation.command}
                />
              ) : null}
              {client.chatPrompt ? (
                <CommandBlock
                  label={`Paste into ${client.name}`}
                  value={client.chatPrompt}
                />
              ) : null}
              <CommandBlock
                label="Genfeed connector URL"
                value={client.connectUrl}
              />
              <p className="text-sm leading-6 text-surface/75">
                When your agent opens the approval link, sign in or create your
                free Genfeed account, then approve access. Ask {client.name} to
                show your brands to check the connection. Generation uses your
                Genfeed credits.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {agentClients.map((option) => (
                <Button
                  ariaLabel={`Connect ${option.name}`}
                  className="h-auto min-h-18 w-full justify-start gap-2 rounded-card p-3 text-left whitespace-normal sm:min-h-28 sm:flex-col sm:items-start sm:gap-3 sm:p-4"
                  key={option.slug}
                  onClick={() => setClient(option)}
                  textTransform="none"
                  variant={ButtonVariant.SECONDARY}
                  withWrapper={false}
                >
                  <AgentClientLogo client={option} />
                  <span className="min-w-0 break-words text-xs leading-5 sm:text-sm">
                    {option.name}
                  </span>
                </Button>
              ))}
            </div>
          )}
        </Modal.Body>
      </Modal.Content>
    </Modal.Root>
  );
}
