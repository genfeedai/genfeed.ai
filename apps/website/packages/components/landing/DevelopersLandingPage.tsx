'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import { GithubIcon } from '@genfeedai/helpers/ui/icons/brands';
import { useMarketingEntrance } from '@hooks/ui/use-marketing-entrance';
import { EnvironmentService } from '@services/core/environment.service';
import ButtonTracked from '@ui/buttons/tracked/ButtonTracked';
import { Code } from '@ui/primitives/code';
import { Pre } from '@ui/primitives/pre';
import { Heading } from '@ui/typography/heading';
import { Text } from '@ui/typography/text';
import FaqGrid from '@web-components/content/FaqGrid';
import LandingFooter from '@web-components/landing/LandingFooter';
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
      'Connect Claude, Cursor, or any MCP client to a curated catalog of content actions. Your agent drafts, schedules, and publishes. Every risky action is gated behind human review.',
    icon: Terminal,
    title: 'MCP Server Built In',
  },
  {
    description:
      'The whole platform is AGPL open source. Run it with Docker on your own infrastructure, with your own provider keys. No black box between your agent and your channels.',
    icon: GitBranch,
    title: 'Open Source, Self-Hostable',
  },
  {
    description:
      'X, LinkedIn, Instagram, TikTok, YouTube, Discord, Slack, Telegram, and dozens more. One connected surface instead of a pile of platform SDKs and OAuth dances.',
    icon: Layers,
    title: 'Every Channel, One Surface',
  },
  {
    description:
      'Recurring publishing runs on a real workflow engine with triggers, schedules, and approval gates. Automation you can inspect, not a cron job you have to trust.',
    icon: Server,
    title: 'Workflow Engine Underneath',
  },
];

const STEPS = [
  {
    icon: FileText,
    label: 'Brief',
    sublabel: 'Send a brief from your agent, workflow, or the studio',
  },
  {
    icon: Sparkles,
    label: 'Generate',
    sublabel: 'Platform-native posts, images, and video from one brief',
  },
  {
    icon: BadgeCheck,
    label: 'Review',
    sublabel: 'Human approval gates before anything goes live',
  },
  {
    icon: Send,
    label: 'Publish',
    sublabel: 'Scheduled delivery to every connected channel',
  },
];

const FAQS = [
  {
    answer:
      'Yes. The monorepo is AGPL-3.0 and public on GitHub: the API, the generation pipelines, the workflow engine, and the MCP server. Enterprise features live in a clearly separated commercial directory.',
    question: 'Is it actually open source?',
  },
  {
    answer:
      'Yes. The self-hosted stack runs with Docker on your own infrastructure with your own model provider keys. Self-hosting is free; the cloud version adds managed credits, hosted MCP, and zero-ops publishing.',
    question: 'Can I self-host it?',
  },
  {
    answer:
      'The MCP server is the programmatic surface today: connect Claude, Cursor, or any MCP client and drive content through a reviewed action catalog. Headless API keys for direct REST access are on the public roadmap.',
    question: 'Is there a public REST API?',
  },
  {
    answer:
      'Cloud pricing is usage-based. Credits meter generation and publishing output, with a free tier to start. There are no hard caps on brands or connected channels. Self-hosted has no platform fee at all.',
    question: 'How does pricing work?',
  },
];

export default function DevelopersLandingPage(): React.ReactElement {
  const containerRef = useMarketingEntrance();
  const signUpHref = `${EnvironmentService.apps.app}/sign-up`;
  const githubHref = EnvironmentService.github.core;

  return (
    <div ref={containerRef}>
      <PageLayout
        badge="Genfeed for Developers"
        badgeIcon={Terminal}
        title="Content infrastructure for developers"
        description="One open-source surface to generate, review, and publish brand-native content on every channel, driven by your agents, your workflows, or your own self-hosted stack."
        heroActions={
          <>
            <ButtonTracked
              asChild
              size={ButtonSize.PUBLIC}
              trackingName="developers_hero_click"
              trackingData={{ action: 'start_free' }}
            >
              <Link href={signUpHref} target="_blank" rel="noopener noreferrer">
                Start creating
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
            <p className="border-b border-edge/5 bg-background/95 px-4 py-2 text-2xs font-bold uppercase tracking-[0.14em] text-surface/45">
              Connect your agent
            </p>
            <Pre className="overflow-x-auto bg-background/80 p-6 text-sm leading-6">
              <Code className="bg-transparent text-surface/70">
                {MCP_SNIPPET}
              </Code>
            </Pre>
            <p className="border-t border-edge/5 bg-background/95 px-4 py-3 text-xs text-surface/55">
              One MCP endpoint. Claude, Cursor, or any MCP client can draft,
              schedule, and publish through reviewed actions.
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
                Distribution Is the Bottleneck, Not Generation
              </Heading>
              <Text as="p" className="text-surface/65">
                Any model can generate content. The hard part is everything
                after: making it platform-native, keeping it on-brand, getting
                it approved, publishing it to eight channels, and reading what
                worked. Genfeed is that layer: open source, agent-ready, and
                built to run on your terms.
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
            Built Like Infrastructure, Not a Marketing Tool
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
            From Brief to Published, Programmatically
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

        {/* FAQ */}
        <section className="gsap-section max-w-4xl mx-auto pb-16 px-6">
          <Heading as="h3" className="text-2xl font-bold text-center mb-8">
            Straight Answers
          </Heading>
          <FaqGrid items={FAQS} />
        </section>

        {/* Final CTA */}
        <section className="max-w-4xl mx-auto pb-16 px-6">
          <div className="gen-card-spotlight p-12 text-center">
            <div className="flex justify-center mb-4">
              <Terminal className="size-8 text-surface" />
            </div>
            <Heading as="h3" className="text-2xl font-bold mb-2 text-surface">
              Ship Content Like You Ship Code
            </Heading>
            <Text as="p" className="text-surface/70 mb-6 max-w-lg mx-auto">
              Connect the MCP server, or clone the repo and run the whole stack
              yourself. Free to start, open source forever.
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
                  Start creating
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
    </div>
  );
}
