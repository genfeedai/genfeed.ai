import {
  AGENT_CLIENT_CAPABILITIES,
  agentClients,
} from '@data/agent-clients.data';
import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import type { AgentClientContentProps } from '@props/agent-client.props';
import AgentClientExamples from '@public/agent-clients/agent-client-examples';
import AgentClientInstallAction from '@public/agent-clients/agent-client-install-action';
import AgentClientSetup from '@public/agent-clients/agent-client-setup';
import AgentClientVisual from '@public/agent-clients/agent-client-visual';
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
import MarketingEntrance from '@web-components/MarketingEntrance';
import PageLayout from '@web-components/PageLayout';
import { Terminal } from 'lucide-react';
import Link from 'next/link';

export default function AgentClientContent({
  channels,
  client,
}: AgentClientContentProps): React.ReactElement {
  const signUpHref = `${EnvironmentService.apps.app}/sign-up`;
  const others = agentClients.filter((entry) => entry.slug !== client.slug);

  return (
    <MarketingEntrance hero={false} sections={false}>
      <PageLayout
        badge={`Genfeed MCP · ${client.name}`}
        badgeIcon={Terminal}
        compact
        description={client.description}
        heroActions={
          <>
            <AgentClientInstallAction client={client} />
            <Button
              asChild
              size={ButtonSize.PUBLIC}
              variant={ButtonVariant.SECONDARY}
            >
              <a href={signUpHref} rel="noopener noreferrer" target="_blank">
                Start free
              </a>
            </Button>
          </>
        }
        heroDetails={
          <p className="text-sm leading-6 text-surface/65">
            {client.installation.method} · Browser sign-in · Your Genfeed
            workspace
          </p>
        }
        heroVisual={<AgentClientVisual client={client} />}
        title={client.title}
      >
        <AgentClientSetup client={client} />
        <AgentClientExamples client={client} />

        <WebSection className="gsap-section" maxWidth="xl" py="md">
          <SectionHeader
            className="[&_h2]:text-3xl sm:[&_h2]:text-4xl"
            description={client.about}
            title={`Your creative workspace, inside ${client.name}`}
          />
          <p className="mb-6 text-center text-sm font-semibold text-surface/75">
            Connected to Genfeed, {client.name} can:
          </p>
          <NeuralGrid columns={2}>
            {AGENT_CLIENT_CAPABILITIES.map((capability) => (
              <NeuralGridItem key={capability} padding="lg">
                <p className="text-base leading-7 text-surface/75">
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
            className="[&_h2]:text-3xl sm:[&_h2]:text-4xl"
            description={`${client.name} drafts and schedules for every channel you connect in Genfeed, and publishes after your review.`}
            title={`Which platforms can ${client.name} post to?`}
          />
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {channels.map((channel) => (
              <li key={channel.slug}>
                <Link
                  className="flex items-center justify-between rounded-lg border border-edge/10 px-4 py-3 text-base text-surface/85 transition-colors hover:bg-surface/5 hover:text-primary"
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
            className="[&_h2]:text-3xl sm:[&_h2]:text-4xl"
            description="Every client connects to the same Genfeed MCP server."
            title="Use Genfeed with other AI agents"
          />
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {others.map((entry) => (
              <li key={entry.slug}>
                <Link
                  className="flex items-center justify-between rounded-lg border border-edge/10 px-4 py-3 text-base text-surface/85 transition-colors hover:bg-surface/5 hover:text-primary"
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
            className="[&_h2]:text-3xl sm:[&_h2]:text-4xl"
            title={`${client.name} and Genfeed: frequently asked questions`}
          />
          <FaqGrid items={[...client.faq]} />
        </WebSection>

        <CtaSection
          description="Bring your brand context and creative tools into the place you already work."
          title={`Use Genfeed from ${client.name}.`}
        >
          <AgentClientInstallAction client={client} />
          <Button
            asChild
            size={ButtonSize.PUBLIC}
            variant={ButtonVariant.SECONDARY}
          >
            <Link href="/pricing">View pricing</Link>
          </Button>
        </CtaSection>
      </PageLayout>
    </MarketingEntrance>
  );
}
