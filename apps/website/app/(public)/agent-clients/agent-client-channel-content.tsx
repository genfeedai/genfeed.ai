'use client';

import {
  type AgentClientChannelPage,
  getAgentClientChannels,
} from '@data/agent-client-channels.data';
import {
  type AgentClient,
  agentClients,
  getAgentClientCommandBlocks,
} from '@data/agent-clients.data';
import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { useMarketingEntrance } from '@hooks/ui/use-marketing-entrance';
import CommandBlock from '@public/agent-clients/agent-client-command-block';
import { EnvironmentService } from '@services/core/environment.service';
import SectionHeader from '@ui/marketing/SectionHeader';
import { Button } from '@ui/primitives/button';
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

const LINK_CLASS_NAME =
  'text-sm text-surface/75 transition-colors hover:text-primary';

export default function AgentClientChannelContent({
  client,
  page,
}: {
  client: AgentClient;
  page: AgentClientChannelPage;
}): React.ReactElement {
  const containerRef = useMarketingEntrance({ hero: false, sections: false });
  const signUpHref = `${EnvironmentService.apps.app}/sign-up`;
  const lowerNoun = page.noun.toLowerCase();
  const otherChannels = getAgentClientChannels().filter(
    (channel) => channel.slug !== page.channelSlug,
  );
  const otherClients = agentClients.filter(
    (entry) => entry.slug !== client.slug,
  );

  return (
    <div ref={containerRef}>
      <PageLayout
        badge={`${client.name} · ${page.channelName}`}
        badgeIcon={Terminal}
        compact
        description={page.description}
        heroActions={
          <>
            <Button
              asChild
              size={ButtonSize.PUBLIC}
              variant={ButtonVariant.DEFAULT}
            >
              <a href={signUpHref} rel="noopener noreferrer" target="_blank">
                Start free
              </a>
            </Button>
            <Button
              asChild
              size={ButtonSize.PUBLIC}
              variant={ButtonVariant.SECONDARY}
            >
              <Link href={`/${client.slug}`}>{client.name} setup</Link>
            </Button>
          </>
        }
        title={page.title}
      >
        <WebSection className="gsap-section" maxWidth="lg" py="sm">
          <SectionHeader
            className="[&_h2]:text-4xl"
            description={`${client.connectInstruction} Then connect your ${page.channelName} account in Genfeed once.`}
            title={`How to post to ${page.channelName} from ${client.name}`}
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
          maxWidth="xl"
          py="md"
        >
          <SectionHeader
            className="[&_h2]:text-4xl"
            description={`Ask in plain language. Genfeed holds ${lowerNoun} for review before anything goes to ${page.channelName}.`}
            title={`What can you ask ${client.name} to do on ${page.channelName}?`}
          />
          <NeuralGrid columns={3}>
            {page.prompts.map((prompt) => (
              <NeuralGridItem key={prompt} padding="lg">
                <p className="text-sm leading-relaxed text-surface/75">
                  “{prompt}”
                </p>
              </NeuralGridItem>
            ))}
          </NeuralGrid>
        </WebSection>

        <WebSection className="gsap-section" maxWidth="xl" py="md">
          <SectionHeader
            className="[&_h2]:text-4xl"
            description={`Everything ${client.name} can make for ${page.channelName} through Genfeed.`}
            title={`${page.channelName} content Genfeed creates`}
          />
          <NeuralGrid columns={2}>
            {page.features.map((feature) => (
              <NeuralGridItem key={feature} padding="lg">
                <p className="text-sm leading-relaxed text-surface/65">
                  {feature}
                </p>
              </NeuralGridItem>
            ))}
          </NeuralGrid>
          <p className="mt-6 text-center text-sm">
            <Link
              className={LINK_CLASS_NAME}
              href={`/integrations/${page.channelSlug}`}
            >
              More about Genfeed for {page.channelName}
            </Link>
          </p>
        </WebSection>

        <WebSection
          bg="bordered"
          className="gsap-section"
          maxWidth="xl"
          py="md"
        >
          <SectionHeader
            className="[&_h2]:text-4xl"
            title={`Other channels ${client.name} can post to`}
          />
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {otherChannels.map((channel) => (
              <li key={channel.slug}>
                <Link
                  className={LINK_CLASS_NAME}
                  href={`/${client.slug}/${channel.slug}`}
                >
                  {channel.name}
                </Link>
              </li>
            ))}
          </ul>
        </WebSection>

        <WebSection className="gsap-section" maxWidth="xl" py="md">
          <SectionHeader
            className="[&_h2]:text-4xl"
            title={`Schedule ${page.channelName} ${lowerNoun} from other AI agents`}
          />
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {otherClients.map((entry) => (
              <li key={entry.slug}>
                <Link
                  className={LINK_CLASS_NAME}
                  href={`/${entry.slug}/${page.channelSlug}`}
                >
                  {entry.name}
                </Link>
              </li>
            ))}
          </ul>
        </WebSection>

        <WebSection
          bg="bordered"
          className="gsap-section"
          maxWidth="md"
          py="md"
        >
          <SectionHeader
            className="[&_h2]:text-4xl"
            title={`${client.name} and ${page.channelName}: frequently asked questions`}
          />
          <FaqGrid items={[...page.faq]} />
        </WebSection>

        <CtaSection
          description={`Start on managed cloud, connect ${page.channelName}, then connect ${client.name} with the steps above.`}
          title={`Post to ${page.channelName} from ${client.name}.`}
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
