'use client';

import {
  AGENT_CLIENT_FAMILIES,
  AGENT_CLIENT_SKILLS_ONLY_COPY,
  type AgentClient,
  agentClients,
  getAgentClient,
} from '@data/agent-clients.data';
import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import type { AgentConnectDialogProps } from '@props/agent-client.props';
import CommandBlock from '@public/agent-clients/agent-client-command-block';
import { AGENT_CONNECT_EVENT } from '@ui/buttons/connect-agent/connect-agent.event';
import { Modal } from '@ui/modals/compound';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@ui/primitives/accordion';
import { Button } from '@ui/primitives/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@ui/primitives/tabs';
import AgentClientLogo from '@web-components/content/AgentClientLogo';
import { ArrowLeft, ChevronRight, ExternalLink } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

export default function AgentConnectDialog({
  openOnMount = false,
  returnFocusTo = null,
}: AgentConnectDialogProps) {
  const [open, setOpen] = useState(false);
  const [client, setClient] = useState<AgentClient | null>(null);
  const family = AGENT_CLIENT_FAMILIES.find((option) =>
    option.slugs.some((slug) => slug === client?.slug),
  );
  const trigger = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const show = (restoreTo?: HTMLElement | null) => {
      trigger.current =
        restoreTo !== undefined
          ? restoreTo
          : document.activeElement instanceof HTMLElement
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
    const onEvent = () => show();
    const showDeepLink = () => {
      if (
        window.location.pathname === '/agent' &&
        window.location.hash === '#connect'
      )
        show();
    };
    if (openOnMount) show(returnFocusTo);
    else showDeepLink();
    window.addEventListener(AGENT_CONNECT_EVENT, onEvent);
    window.addEventListener('hashchange', showDeepLink);
    return () => {
      window.removeEventListener(AGENT_CONNECT_EVENT, onEvent);
      window.removeEventListener('hashchange', showDeepLink);
    };
  }, [openOnMount, returnFocusTo]);

  function selectClient(nextClient: AgentClient | null) {
    setClient(nextClient);
  }

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
        className="flex max-h-[90dvh] w-[calc(100%-2rem)] flex-col overflow-hidden"
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          trigger.current?.focus();
        }}
        size={client ? 'lg' : 'md'}
      >
        <Modal.Header className="shrink-0 pr-6 text-left">
          <Modal.Title>Connect your agent</Modal.Title>
          <Modal.Description>
            {client
              ? `Set up Genfeed in ${client.name}.`
              : 'Use Genfeed from the agent you already work with.'}
          </Modal.Description>
        </Modal.Header>
        <Modal.Body
          className="min-h-0 min-w-0 overscroll-contain py-0"
          data-modal-scroll-region=""
          scrollable
        >
          {client ? (
            <div className="space-y-5">
              <Button
                textTransform="none"
                onClick={() => selectClient(null)}
                size={ButtonSize.SM}
                variant={ButtonVariant.GHOST}
              >
                <ArrowLeft aria-hidden className="mr-2 size-4" />
                Choose another agent
              </Button>
              <Tabs
                value={client.slug}
                onValueChange={(slug) => {
                  const nextClient = agentClients.find(
                    (option) => option.slug === slug,
                  );
                  if (nextClient) selectClient(nextClient);
                }}
              >
                {family && family.slugs.length > 1 ? (
                  <TabsList
                    aria-label={`${family.name} app`}
                    className="w-full"
                  >
                    {family.slugs.map((slug) => (
                      <TabsTrigger className="flex-1" key={slug} value={slug}>
                        {getAgentClient(slug).name}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                ) : null}
                <TabsContent
                  aria-label={`Set up ${client.name}`}
                  className="space-y-5"
                  key={client.slug}
                  value={client.slug}
                >
                  <div className="flex items-center gap-3">
                    <AgentClientLogo client={client} />
                    <div>
                      <h3 className="font-semibold">{client.name}</h3>
                      <p className="text-xs text-surface/60">
                        {client.installation.method}
                      </p>
                    </div>
                  </div>
                  <Accordion type="multiple" defaultValue={['install']}>
                    <AccordionItem value="install">
                      <AccordionTrigger className="text-left text-sm hover:no-underline">
                        1. Add Genfeed
                      </AccordionTrigger>
                      <AccordionContent className="space-y-4">
                        <p className="text-sm leading-6 text-surface/75">
                          {client.connectInstruction}
                        </p>
                        {client.installation.command ? (
                          <CommandBlock
                            label={client.installation.method}
                            value={client.installation.command}
                          />
                        ) : null}
                        <CommandBlock
                          label="Genfeed connector URL"
                          value={client.connectUrl}
                        />
                        {client.installation.destination ? (
                          <Button
                            asChild
                            className="w-full"
                            size={ButtonSize.PUBLIC}
                          >
                            <a
                              href={client.installation.destination}
                              rel="noopener noreferrer"
                              target="_blank"
                            >
                              {client.installation.destinationLabel}
                              <ExternalLink
                                aria-hidden
                                className="ml-2 size-4"
                              />
                            </a>
                          </Button>
                        ) : null}
                      </AccordionContent>
                    </AccordionItem>
                    {client.chatPrompt ? (
                      <AccordionItem value="chat-prompt">
                        <AccordionTrigger className="text-left text-sm hover:no-underline">
                          Connection prompt
                        </AccordionTrigger>
                        <AccordionContent>
                          <CommandBlock
                            label={`Paste into ${client.name}`}
                            value={client.chatPrompt}
                          />
                        </AccordionContent>
                      </AccordionItem>
                    ) : null}
                    <AccordionItem value="approval">
                      <AccordionTrigger className="text-left text-sm hover:no-underline">
                        2. Approve and check the connection
                      </AccordionTrigger>
                      <AccordionContent>
                        <p className="text-sm leading-6 text-surface/75">
                          Sign in or create your free Genfeed account when
                          prompted, then approve access. Ask {client.name} to
                          show your brands. Generation in Genfeed uses your
                          Genfeed credits.
                        </p>
                      </AccordionContent>
                    </AccordionItem>
                    {client.skillsCommand ? (
                      <AccordionItem value="skills">
                        <AccordionTrigger className="text-left text-sm hover:no-underline">
                          Skills-only alternative
                        </AccordionTrigger>
                        <AccordionContent className="space-y-4">
                          <p className="text-sm leading-6 text-surface/75">
                            {AGENT_CLIENT_SKILLS_ONLY_COPY}
                          </p>
                          <CommandBlock
                            label="Skills-only alternative"
                            value={client.skillsCommand}
                          />
                        </AccordionContent>
                      </AccordionItem>
                    ) : null}
                    {client.setupPrompt ? (
                      <AccordionItem value="setup-prompt">
                        <AccordionTrigger className="text-left text-sm hover:no-underline">
                          Setup prompt
                        </AccordionTrigger>
                        <AccordionContent className="space-y-4">
                          <p className="text-sm leading-6 text-surface/75">
                            To let {client.name} configure the connector with
                            local shell access, paste this setup prompt.
                          </p>
                          <CommandBlock
                            label="Setup prompt"
                            value={client.setupPrompt}
                          />
                        </AccordionContent>
                      </AccordionItem>
                    ) : null}
                  </Accordion>
                </TabsContent>
              </Tabs>
            </div>
          ) : (
            <div className="space-y-1">
              {AGENT_CLIENT_FAMILIES.map((option) => (
                <Button
                  ariaLabel={`Connect ${option.name}`}
                  className="h-auto min-h-16 w-full justify-start gap-3 rounded-lg px-3 py-3 text-left whitespace-normal"
                  key={option.name}
                  onClick={() => selectClient(getAgentClient(option.slugs[0]))}
                  textTransform="none"
                  variant={ButtonVariant.GHOST}
                  withWrapper={false}
                >
                  <AgentClientLogo client={getAgentClient(option.slugs[0])} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">
                      {option.name}
                    </span>
                    <span className="block text-xs leading-5 text-surface/60">
                      {option.description}
                    </span>
                  </span>
                  <ChevronRight
                    aria-hidden
                    className="size-4 shrink-0 text-surface/40"
                  />
                </Button>
              ))}
            </div>
          )}
        </Modal.Body>
      </Modal.Content>
    </Modal.Root>
  );
}
