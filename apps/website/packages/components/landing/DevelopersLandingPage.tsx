import { agentClients } from '@data/agent-clients.data';
import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { GithubIcon } from '@genfeedai/helpers/ui/icons/brands';
import { EnvironmentService } from '@services/core/environment.service';
import ButtonTracked from '@ui/buttons/tracked/ButtonTracked';
import { Code } from '@ui/primitives/code';
import { Pre } from '@ui/primitives/pre';
import { Heading } from '@ui/typography/heading';
import { Text } from '@ui/typography/text';
import FaqGrid from '@web-components/content/FaqGrid';
import MarketingArtwork from '@web-components/content/MarketingArtwork';
import LandingFooter from '@web-components/landing/LandingFooter';
import MarketingEntrance from '@web-components/MarketingEntrance';
import PageLayout from '@web-components/PageLayout';
import {
  ArrowRight,
  BadgeCheck,
  FileText,
  GitBranch,
  Layers,
  Send,
  Server,
  Sparkles,
  Terminal,
} from 'lucide-react';
import Link from 'next/link';

// Marketing copy: always the hosted endpoint, never the build's own MCP config
// (matches app/.well-known/api-catalog/route.ts).
const MCP_SNIPPET = `{
  "mcpServers": {
    "genfeed": {
      "url": "https://mcp.genfeed.ai/mcp"
    }
  }
}`;

const FEATURES = [
  {
    description:
      'Connect your agent to Genfeed for content drafts, scheduling and available analytics. Claude uses the content connector; clients on the standard MCP connector can also generate media.',
    icon: Terminal,
    title: 'Connect Through MCP',
  },
  {
    description:
      'Inspect the AGPL-licensed source, adapt it to your workflow, or run the stack with Docker and your own provider keys. Use managed cloud when you want hosting handled for you.',
    icon: GitBranch,
    title: 'Run It Your Way',
  },
  {
    description:
      'Create content for X, LinkedIn and other supported destinations from the same workspace. Connect the accounts you need and check the available publishing actions for each.',
    icon: Layers,
    title: 'Reuse Your Connected Accounts',
  },
  {
    description:
      'Use the standard MCP connector or Genfeed Studio to build generation and publishing workflows with triggers and schedules. Review outputs and inspect execution status when a run needs attention.',
    icon: Server,
    title: 'Build Repeatable Workflows',
  },
];

const STEPS = [
  {
    icon: FileText,
    label: 'Brief',
    sublabel:
      'Send a product update or content brief from your connected agent',
  },
  {
    icon: Sparkles,
    label: 'Generate',
    sublabel:
      'Create drafts and assets with the tools available to your client',
  },
  {
    icon: BadgeCheck,
    label: 'Review',
    sublabel: 'Review the content and choose what to schedule or publish',
  },
  {
    icon: Send,
    label: 'Publish',
    sublabel:
      'Publish to supported connected accounts and read available metrics',
  },
];

const FAQS = [
  {
    answer:
      'Yes. The public AGPL-licensed monorepo includes the API, generation pipelines, workflow engine and MCP server. You can inspect and adapt the source under its license.',
    question: 'Is it actually open source?',
  },
  {
    answer:
      'Yes. Run the Docker stack with your own infrastructure and provider keys. The open-source software has no platform fee; you cover hosting and model costs. Managed cloud handles hosting and uses Genfeed credits.',
    question: 'Can I self-host it?',
  },
  {
    answer:
      'Start with the documented MCP connection for your agent. Claude uses browser authorization and the content connector; other supported clients use the standard /mcp connector. The documentation covers endpoints, authentication and client-specific capabilities.',
    question: 'How do I integrate Genfeed with my agent?',
  },
  {
    answer:
      'Start for $0 on managed cloud. Paid usage follows your plan and credits. Self-hosting has no Genfeed platform fee; you pay for your infrastructure and model providers.',
    question: 'How does pricing work?',
  },
];

export default function DevelopersLandingPage(): React.ReactElement {
  const signUpHref = `${EnvironmentService.apps.app}/sign-up`;
  const githubHref = EnvironmentService.github.core;

  return (
    <MarketingEntrance>
      <PageLayout
        heroMedia={<MarketingArtwork page="/developers" />}
        badge="Genfeed for Developers"
        badgeIcon={Terminal}
        title="Distribution for developers"
        description="Connect your agent to Genfeed to turn product updates into content drafts, media and scheduled posts. Use the hosted MCP server or run the open-source stack yourself."
        heroActions={
          <>
            <ButtonTracked
              asChild
              size={ButtonSize.PUBLIC}
              trackingName="developers_hero_click"
              trackingData={{ action: 'start_free' }}
            >
              <Link href={signUpHref} target="_blank" rel="noopener noreferrer">
                Start for $0
                <ArrowRight className="size-4" />
              </Link>
            </ButtonTracked>
            <ButtonTracked
              asChild
              variant={ButtonVariant.SECONDARY}
              size={ButtonSize.PUBLIC}
              trackingName="developers_hero_click"
              trackingData={{ action: 'view_github' }}
            >
              <Link href={githubHref} target="_blank" rel="noopener noreferrer">
                <GithubIcon className="size-4" />
                Star on GitHub
              </Link>
            </ButtonTracked>
          </>
        }
        heroVisual={
          <div className="overflow-hidden rounded-lg bg-card shadow-border-strong">
            <p className="border-b border-edge/5 bg-background/95 px-4 py-2 text-xs font-bold uppercase tracking-[0.12em] text-surface/60">
              Connect your agent
            </p>
            <Pre className="overflow-x-auto bg-background/80 p-6 text-sm leading-6">
              <Code className="bg-transparent text-surface/70">
                {MCP_SNIPPET}
              </Code>
            </Pre>
            <p className="border-t border-edge/5 bg-background/95 px-4 py-3 text-xs text-surface/55">
              Connect Claude for drafts, scheduling and analytics, then open
              Genfeed Studio for media creation. Cursor and other MCP clients
              can also generate assets through the standard connector.
            </p>
          </div>
        }
        compact
        showFooter={false}
      >
        {/* Positioning card */}
        <section className="gsap-section max-w-4xl mx-auto pb-16 px-6">
          <div className="gen-card-spotlight p-8">
            <div className="flex flex-col gap-3">
              <Heading as="h3" className="text-2xl font-bold">
                Distribution As Tool Calls
              </Heading>
              <Text as="p" className="text-surface/65">
                Your agent calls Genfeed over MCP: read brand context, create
                drafts, check publishing readiness and schedule approved posts.
                Read available analytics before the next run. Use the hosted
                server or connect to your own deployment.
              </Text>
              <div className="flex flex-row items-center flex-wrap gap-2">
                {['Generate', 'Review', 'Publish', 'Measure'].map((tag) => (
                  <span
                    key={tag}
                    className="px-3 py-1 text-xs border border-[var(--gen-accent-border)] text-[var(--gen-accent-text)]"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Features grid */}
        <section className="gsap-section max-w-6xl mx-auto pb-16 px-6">
          <Heading as="h3" className="text-2xl font-bold text-center mb-8">
            The Building Blocks For Your Integration
          </Heading>
          <div className="gsap-grid grid grid-cols-1 gap-1.5 md:grid-cols-2">
            {FEATURES.map((feature) => {
              const Icon = feature.icon;
              return (
                <div
                  key={feature.title}
                  className="gsap-card gen-card-spotlight p-8"
                >
                  <div className="mb-4 flex">
                    <div className="size-12 flex items-center justify-center border border-[var(--gen-accent-border)] bg-[var(--gen-accent-bg)]">
                      <Icon className="size-6 text-[color:hsl(var(--gen-accent))]" />
                    </div>
                  </div>
                  <Heading as="h4" className="font-semibold mb-2 text-surface">
                    {feature.title}
                  </Heading>
                  <Text className="text-sm text-surface/65">
                    {feature.description}
                  </Text>
                </div>
              );
            })}
          </div>
        </section>

        {/* How it works */}
        <section className="gsap-section max-w-4xl mx-auto pb-16 px-6">
          <Heading as="h3" className="text-2xl font-bold text-center mb-12">
            Connect, Draft, Review, Publish
          </Heading>
          <div className="space-y-0">
            {STEPS.map((step, index) => {
              const Icon = step.icon;
              return (
                <div key={step.label}>
                  <div className="flex flex-row items-center gap-6 py-6">
                    <div className="flex-shrink-0 size-14 flex items-center justify-center border border-[var(--gen-accent-border)] bg-[var(--gen-accent-bg)]">
                      <Icon className="size-6 text-[color:hsl(var(--gen-accent))]" />
                    </div>
                    <div className="flex flex-col gap-1">
                      <Text className="text-lg font-bold text-surface">
                        {step.label}
                      </Text>
                      <Text className="text-sm text-surface/65">
                        {step.sublabel}
                      </Text>
                    </div>
                  </div>
                  {index < STEPS.length - 1 && (
                    <div className="gen-divider-accent" />
                  )}
                </div>
              );
            })}
          </div>
        </section>

        <section className="gsap-section max-w-6xl mx-auto pb-16 px-6">
          <Heading as="h3" className="text-2xl font-bold text-center mb-8">
            Connect the client you already use
          </Heading>
          <div className="gsap-grid grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
            {agentClients.map((client) => (
              // The link's ::after covers the card, so the whole card is the
              // tap target while the link's name stays the client's name.
              <div
                key={client.slug}
                className="gsap-card gen-card-spotlight relative p-6"
              >
                <Link
                  className="text-sm font-semibold text-surface transition-colors after:absolute after:inset-0 hover:text-primary"
                  href={`/${client.slug}`}
                >
                  {client.name}
                </Link>
                <Text className="mt-2 text-sm text-surface/65">
                  {client.description}
                </Text>
              </div>
            ))}
          </div>
        </section>

        {/* FAQ */}
        <section className="gsap-section max-w-4xl mx-auto pb-16 px-6">
          <Heading as="h3" className="text-2xl font-bold text-center mb-8">
            Straight Answers
          </Heading>
          <FaqGrid items={FAQS} />
        </section>

        {/* Final CTA */}
        <section className="max-w-4xl mx-auto pb-16 px-6">
          <div className="gen-card-spotlight p-6 text-center sm:p-12">
            <div className="flex justify-center mb-4">
              <Terminal className="size-8 text-surface" />
            </div>
            <Heading as="h3" className="text-2xl font-bold mb-2 text-surface">
              Connect Your Agent To Genfeed
            </Heading>
            <Text as="p" className="text-surface/70 mb-6 max-w-lg mx-auto">
              Connect your agent for a first draft, or explore the source to run
              and adapt Genfeed yourself. Start for $0 on managed cloud.
            </Text>
            <div className="flex flex-row items-center flex-wrap gap-4 justify-center">
              <ButtonTracked
                asChild
                size={ButtonSize.PUBLIC}
                trackingName="developers_cta_click"
                trackingData={{ action: 'start_free' }}
              >
                <Link
                  href={signUpHref}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Start for $0
                </Link>
              </ButtonTracked>
              <ButtonTracked
                asChild
                variant={ButtonVariant.SECONDARY}
                size={ButtonSize.PUBLIC}
                trackingName="developers_cta_click"
                trackingData={{ action: 'view_github' }}
              >
                <Link
                  href={githubHref}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <GithubIcon className="size-4" />
                  View on GitHub
                </Link>
              </ButtonTracked>
            </div>
          </div>
        </section>
      </PageLayout>

      <LandingFooter />
    </MarketingEntrance>
  );
}
