'use client';

import {
  AGENT_CLIENT_CAPABILITIES,
  AGENT_CLIENT_MANUAL_KEY_HEADING,
  type AgentClient,
  type AgentClientCommandBlock,
  agentClients,
  GENFEED_AGENT_REPOSITORY_URL,
  GENFEED_MCP_DOCS_URL,
  getAgentClientCommandBlocks,
  getAgentClientManualBlocks,
} from '@data/agent-clients.data';
import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { useMarketingEntrance } from '@hooks/ui/use-marketing-entrance';
import { EnvironmentService } from '@services/core/environment.service';
import SectionHeader from '@ui/marketing/SectionHeader';
import { Button } from '@ui/primitives/button';
import { Code } from '@ui/primitives/code';
import { Pre } from '@ui/primitives/pre';
import FaqGrid from '@web-components/content/FaqGrid';
import {
  CtaSection,
  NeuralGrid,
  NeuralGridItem,
  WebSection,
} from '@web-components/content/NeuralGrid';
import PageLayout from '@web-components/PageLayout';
import { Terminal } from 'lucide-react';
import Link from 'next/link';

function CommandBlock({
  label,
  value,
}: AgentClientCommandBlock): React.ReactElement {
  return (
    <div className="overflow-hidden rounded-lg bg-card shadow-border-strong">
      <p className="border-b border-edge/5 bg-background/95 px-4 py-2 text-2xs font-bold uppercase tracking-[0.14em] text-surface/45">
        {label}
      </p>
      <Pre className="overflow-x-auto bg-background/80 p-6 text-sm leading-6">
        <Code className="bg-transparent text-surface/70">{value}</Code>
      </Pre>
    </div>
  );
}

export default function AgentClientContent({
  client,
}: {
  client: AgentClient;
}): React.ReactElement {
  const containerRef = useMarketingEntrance({ hero: false, sections: false });
  const signUpHref = `${EnvironmentService.apps.app}/sign-up`;
  const others = agentClients.filter((entry) => entry.slug !== client.slug);

  return (
    <div ref={containerRef}>
      <PageLayout
        badge={client.name}
        badgeIcon={Terminal}
        compact
        description={client.description}
        heroActions={
          <>
            <Button
              asChild
              size={ButtonSize.PUBLIC}
              variant={ButtonVariant.DEFAULT}
            >
              <a
                href={GENFEED_AGENT_REPOSITORY_URL}
                rel="noopener noreferrer"
                target="_blank"
              >
                Agent on GitHub
              </a>
            </Button>
            <Button
              asChild
              size={ButtonSize.PUBLIC}
              variant={ButtonVariant.SECONDARY}
            >
              <a
                href={GENFEED_MCP_DOCS_URL}
                rel="noopener noreferrer"
                target="_blank"
              >
                MCP docs
              </a>
            </Button>
          </>
        }
        title={client.title}
      >
        <WebSection className="gsap-section" maxWidth="lg" py="sm">
          <SectionHeader
            className="[&_h2]:text-4xl"
            description={client.oauth.authorizationInstruction}
            title="Connect"
          />
          <div className="flex flex-col gap-4">
            {getAgentClientCommandBlocks(client).map((block) => (
              <CommandBlock
                key={block.label}
                label={block.label}
                value={block.value}
              />
            ))}
          </div>
        </WebSection>

        <WebSection
          bg="bordered"
          className="gsap-section"
          maxWidth="lg"
          py="md"
        >
          <SectionHeader
            className="[&_h2]:text-4xl"
            description={client.manualKey.authorizationInstruction}
            title={AGENT_CLIENT_MANUAL_KEY_HEADING}
          />
          <div className="flex flex-col gap-4">
            {getAgentClientManualBlocks(client).map((block) => (
              <CommandBlock
                key={block.label}
                label={block.label}
                value={block.value}
              />
            ))}
          </div>
        </WebSection>

        <WebSection className="gsap-section" maxWidth="xl" py="md">
          <SectionHeader
            className="[&_h2]:text-4xl"
            description="The same reviewed actions, whichever client opens the connection."
            title="What the agent can do"
          />
          <NeuralGrid columns={2}>
            {AGENT_CLIENT_CAPABILITIES.map((capability) => (
              <NeuralGridItem key={capability} padding="lg">
                <p className="text-sm leading-relaxed text-surface/65">
                  {capability}
                </p>
              </NeuralGridItem>
            ))}
          </NeuralGrid>
        </WebSection>

        <WebSection
          bg="bordered"
          className="gsap-section"
          maxWidth="xl"
          py="md"
        >
          <SectionHeader
            className="[&_h2]:text-4xl"
            description="Each client page reads its install steps from the same connect helper."
            title="Other clients"
          />
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {others.map((entry) => (
              <li key={entry.slug}>
                <Link
                  className="text-sm text-surface/75 transition-colors hover:text-primary"
                  href={`/${entry.slug}`}
                >
                  {entry.name}
                </Link>
              </li>
            ))}
          </ul>
        </WebSection>

        <WebSection className="gsap-section" maxWidth="md" py="md">
          <SectionHeader
            className="[&_h2]:text-4xl"
            description="Answers for this client. Install text comes from the connect helper, not from this page."
            title="Common questions"
          />
          <FaqGrid items={[...client.faq]} />
        </WebSection>

        <CtaSection
          description="Start on managed cloud, then connect this client with the steps above."
          title={`Use Genfeed from ${client.name}.`}
        >
          <Button asChild size={ButtonSize.PUBLIC}>
            <a href={signUpHref} rel="noopener noreferrer" target="_blank">
              Start free
            </a>
          </Button>
          <Button
            asChild
            size={ButtonSize.PUBLIC}
            variant={ButtonVariant.SECONDARY}
          >
            <Link href="/pricing">View pricing</Link>
          </Button>
        </CtaSection>
      </PageLayout>
    </div>
  );
}
