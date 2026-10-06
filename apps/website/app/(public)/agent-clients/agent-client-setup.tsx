'use client';

import {
  AGENT_CLIENT_MANUAL_KEY_HEADING,
  AGENT_CLIENT_SKILLS_ONLY_COPY,
  getAgentClientManualBlocks,
  getAgentClientMcpBlocks,
} from '@data/agent-clients.data';
import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import type { AgentClientVisualProps } from '@props/agent-client.props';
import CommandBlock from '@public/agent-clients/agent-client-command-block';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@ui/primitives/accordion';
import { Button } from '@ui/primitives/button';
import { Check, ExternalLink } from 'lucide-react';

export default function AgentClientSetup({
  client,
}: AgentClientVisualProps): React.ReactElement {
  const { installation } = client;
  return (
    <section
      className="container mx-auto scroll-mt-28 px-6 py-12 sm:py-20"
      id="connect"
    >
      <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16">
        <div>
          <p className="mb-4 text-xs font-semibold uppercase tracking-widest text-surface/65">
            01 / {installation.method}
          </p>
          <h2 className="text-3xl font-semibold tracking-tight text-surface sm:text-4xl">
            Your tools.
            <br />
            Now connected.
          </h2>
          <p className="mt-5 max-w-md text-base leading-7 text-surface/75">
            {client.connectInstruction}
          </p>
          {installation.destination ? (
            <Button
              asChild
              className="mt-6"
              size={ButtonSize.PUBLIC}
              variant={ButtonVariant.SECONDARY}
            >
              <a
                href={installation.destination}
                rel={
                  installation.destination.startsWith('https://')
                    ? 'noopener noreferrer'
                    : undefined
                }
                target={
                  installation.destination.startsWith('https://')
                    ? '_blank'
                    : undefined
                }
              >
                {installation.destinationLabel}
                <ExternalLink aria-hidden className="ml-2 size-4" />
              </a>
            </Button>
          ) : null}
        </div>
        <div className="min-w-0 space-y-5">
          {installation.command ? (
            <CommandBlock
              label={installation.method}
              value={installation.command}
            />
          ) : null}
          {client.chatPrompt ? (
            <CommandBlock
              label={`Paste into ${client.name}`}
              value={client.chatPrompt}
            />
          ) : null}
          {client.skillsCommand ? (
            <>
              <p className="text-sm leading-6 text-surface/75">
                {AGENT_CLIENT_SKILLS_ONLY_COPY}
              </p>
              <CommandBlock
                label="Skills-only alternative"
                value={client.skillsCommand}
              />
            </>
          ) : null}
          {client.setupPrompt ? (
            <>
              <p className="text-sm leading-6 text-surface/75">
                Skills add the Genfeed playbook. To connect your account too,
                paste the setup prompt into {client.name} with local shell
                access.
              </p>
              <CommandBlock label="Setup prompt" value={client.setupPrompt} />
            </>
          ) : null}
          <CommandBlock
            label="Genfeed connector URL"
            value={client.connectUrl}
          />
          <div className="flex items-start gap-3 text-sm leading-6 text-surface/75">
            <Check aria-hidden className="mt-1 size-4 shrink-0" />
            <p>
              Sign in to Genfeed in your browser. Then ask {client.name} to show
              your brands to check the connection.
            </p>
          </div>
          {client.oauth.primaryCommand || client.manualKey ? (
            <Accordion collapsible type="single">
              <AccordionItem value="manual">
                <AccordionTrigger>
                  {client.slug === 'hermes'
                    ? 'CLI setup'
                    : 'Advanced: manual MCP configuration'}
                </AccordionTrigger>
                <AccordionContent className="space-y-4">
                  {client.slug === 'hermes' ? (
                    <p className="text-sm leading-6 text-surface/75">
                      {client.oauth.authorizationInstruction}
                    </p>
                  ) : null}
                  {getAgentClientMcpBlocks(client).map((block) => (
                    <CommandBlock key={block.label} {...block} />
                  ))}
                </AccordionContent>
              </AccordionItem>
              {client.manualKey ? (
                <AccordionItem value="key">
                  <AccordionTrigger>
                    {AGENT_CLIENT_MANUAL_KEY_HEADING}
                  </AccordionTrigger>
                  <AccordionContent className="space-y-4">
                    <p className="leading-6 text-surface/75">
                      {client.manualKey.authorizationInstruction}
                    </p>
                    {getAgentClientManualBlocks(client).map((block) => (
                      <CommandBlock key={block.label} {...block} />
                    ))}
                  </AccordionContent>
                </AccordionItem>
              ) : null}
            </Accordion>
          ) : null}
        </div>
      </div>
    </section>
  );
}
