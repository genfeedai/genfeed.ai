'use client';

import { AGENT_PROMPTS } from '@data/agent-prompts.data';
import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { useMarketingEntrance } from '@hooks/ui/use-marketing-entrance';
import { EnvironmentService } from '@services/core/environment.service';
import ButtonTracked from '@ui/buttons/tracked/ButtonTracked';
import EditorialPoster from '@ui/marketing/EditorialPoster';
import { Heading } from '@ui/typography/heading';
import { Text } from '@ui/typography/text';
import PageLayout from '@web-components/PageLayout';
import { Blocks, BookOpen, Plug, Terminal } from 'lucide-react';
import Link from 'next/link';

const DOCS_URL = 'https://docs.genfeed.ai';
const MCP_DOCS_URL = 'https://docs.genfeed.ai/api-reference/mcp';
const SKILLS_DOCS_URL = 'https://docs.genfeed.ai/skills';

const SURFACES = [
  {
    description:
      'Install @genfeedai/cli and run the agent shell in your terminal. Generate, schedule, publish, and read analytics without leaving the keyboard.',
    icon: Terminal,
    title: 'Genfeed CLI',
  },
  {
    description:
      'Point Claude Code, Codex, or any Streamable HTTP client at the hosted MCP server. Your agent gets Genfeed tools and your workspace data.',
    icon: Plug,
    title: 'MCP server',
  },
  {
    description:
      'Install the product skill catalog into the agent you already use. Skills carry the content discipline; no Genfeed account required to read them.',
    icon: Blocks,
    title: 'Agent skills',
  },
];

const CLI_STEPS = [
  {
    code: 'bun add -g @genfeedai/cli',
    label: 'Install',
    sublabel: 'Node.js 18+. npm install -g @genfeedai/cli works too.',
  },
  {
    code: 'genfeed login',
    label: 'Authenticate',
    sublabel:
      'Opens a browser PKCE flow. Use genfeed login --key gf_live_... for CI and headless machines.',
  },
  {
    code: 'genfeed chat',
    label: 'Run the agent',
    sublabel:
      'The interactive agent shell. genfeed chat send "..." runs one turn and exits.',
  },
];

const MCP_SNIPPETS = [
  {
    code: 'claude mcp add --transport http genfeed --scope user \\\n  https://mcp.genfeed.ai/mcp \\\n  --header "Authorization: Bearer $GENFEED_API_KEY"',
    title: 'Claude Code',
  },
  {
    code: 'codex mcp add genfeed \\\n  --url https://mcp.genfeed.ai/mcp \\\n  --bearer-token-env-var GENFEED_API_KEY',
    title: 'Codex',
  },
];

const CAPABILITIES = [
  'Generate images and video',
  'Draft and edit posts',
  'Schedule and publish',
  'Read performance data',
  'Run workflows',
  'Manage brands and keys',
];

const HERO_VISUAL = (
  <EditorialPoster
    detail="Every output lands in review before it publishes. Nothing goes out that you have not seen."
    eyebrow="Genfeed Agent"
    footer={<span>Publishes to 20+ channels</span>}
    items={[
      {
        label: 'You say',
        value: '"Make me a TikTok slideshow about this product."',
      },
      {
        label: 'It makes',
        value: 'Six slides, hook first, caption and CTA written.',
      },
      {
        label: 'It checks',
        value: 'Your brand, your voice, the right ratio per channel.',
      },
      {
        label: 'You approve',
        value: 'Then it schedules and posts on its own.',
      },
    ]}
    subtitle="Say what you want in a sentence"
    title="It makes the content. You approve it."
  />
);

export default function AgentContent() {
  const containerRef = useMarketingEntrance();
  const signUpHref = `${EnvironmentService.apps.app}/sign-up`;

  return (
    <div ref={containerRef}>
      <PageLayout
        compact
        description="Tell it what you want. It makes the content, keeps it on brand, and schedules it — and shows you everything before it goes out."
        heroActions={
          <>
            <ButtonTracked
              asChild
              size={ButtonSize.PUBLIC}
              trackingData={{ action: 'create_now' }}
              trackingName="agent_hero_click"
            >
              <a href={signUpHref} rel="noopener noreferrer" target="_blank">
                Start for $0
              </a>
            </ButtonTracked>
            <ButtonTracked
              asChild
              size={ButtonSize.PUBLIC}
              trackingData={{ action: 'read_docs' }}
              trackingName="agent_hero_click"
              variant={ButtonVariant.SECONDARY}
            >
              <Link href="/developers">For developers</Link>
            </ButtonTracked>
          </>
        }
        heroVisual={HERO_VISUAL}
        title="Genfeed Agent"
      >
        {/*
          What people actually ask for, before any of the connection detail.
          A reader arriving from an article wants to know what the agent will
          do for them; the CLI and MCP material below answers a different
          question and used to be the only thing on this page.
        */}
        <section className="gsap-section max-w-6xl mx-auto pb-20 px-6">
          <Heading as="h2" className="text-2xl font-bold mb-2 text-surface">
            What people ask it for
          </Heading>
          <Text as="p" className="text-surface/65 mb-8">
            Six requests, and what lands in your workspace.
          </Text>
          <div className="gsap-grid grid grid-cols-1 gap-1.5 md:grid-cols-2">
            {AGENT_PROMPTS.map((prompt) => (
              <Link
                className="flex flex-col gap-3 border border-edge/[0.08] bg-fill/5 p-6 transition-colors hover:border-edge/20 hover:bg-fill/10"
                href={prompt.href}
                key={prompt.ask}
              >
                <Heading as="h3" className="font-semibold text-surface">
                  &ldquo;{prompt.ask}&rdquo;
                </Heading>
                <Text className="text-sm text-surface/65">{prompt.result}</Text>
                <Text className="mt-auto text-[13px] font-semibold text-surface/50">
                  {prompt.hrefLabel}
                </Text>
              </Link>
            ))}
          </div>
        </section>

        {/*
          Everything below is the developer surface. It stays on this page
          because it is shipped and documented, but it is banded off so the
          reader who does not want a terminal knows to stop here.
        */}
        <section className="gsap-section max-w-6xl mx-auto border-t border-edge/[0.08] pb-10 px-6 pt-16">
          <Heading as="h2" className="text-2xl font-bold mb-2 text-surface">
            Connect it to your own tools
          </Heading>
          <Text as="p" className="text-surface/65">
            The rest of this page is for developers. There is a fuller tour on{' '}
            <Link className="link" href="/developers">
              the developers page
            </Link>
            , and the full reference in{' '}
            <a
              className="link"
              href={DOCS_URL}
              rel="noopener noreferrer"
              target="_blank"
            >
              the docs
            </a>
            .
          </Text>
        </section>

        {/* Three surfaces */}
        <section className="gsap-section max-w-6xl mx-auto pb-16 px-6">
          <div className="gsap-grid grid grid-cols-1 gap-1.5 md:grid-cols-3">
            {SURFACES.map((surface) => {
              const Icon = surface.icon;
              return (
                <div
                  key={surface.title}
                  className="gsap-card gen-card-spotlight p-8"
                >
                  <div className="mb-4 flex">
                    <div className="size-12 flex items-center justify-center border border-[var(--gen-accent-border)] bg-[var(--gen-accent-bg)]">
                      <Icon className="size-6 text-[color:hsl(var(--gen-accent))]" />
                    </div>
                  </div>
                  <Heading as="h3" className="font-semibold mb-2 text-surface">
                    {surface.title}
                  </Heading>
                  <Text className="text-sm text-surface/65">
                    {surface.description}
                  </Text>
                </div>
              );
            })}
          </div>
        </section>

        {/* Install the CLI */}
        <section className="gsap-section max-w-4xl mx-auto pb-16 px-6">
          <Heading as="h2" className="text-2xl font-bold mb-2 text-surface">
            Install the CLI
          </Heading>
          <Text as="p" className="text-surface/65 mb-8">
            Three commands from an empty terminal to a running agent.
          </Text>
          <div className="space-y-0">
            {CLI_STEPS.map((step, index) => (
              <div key={step.label}>
                <div className="flex flex-col gap-3 py-6">
                  <Text className="text-lg font-bold text-surface">
                    {step.label}
                  </Text>
                  <pre className="overflow-x-auto border gen-border bg-card p-4 text-sm text-surface">
                    {step.code}
                  </pre>
                  <Text className="text-sm text-surface/65">
                    {step.sublabel}
                  </Text>
                </div>
                {index < CLI_STEPS.length - 1 && (
                  <div className="gen-divider-accent" />
                )}
              </div>
            ))}
          </div>
        </section>

        {/* Connect your own agent */}
        <section className="gsap-section max-w-4xl mx-auto pb-16 px-6">
          <Heading as="h2" className="text-2xl font-bold mb-2 text-surface">
            Connect your own agent
          </Heading>
          <Text as="p" className="text-surface/65 mb-8">
            The hosted MCP server speaks Streamable HTTP at{' '}
            <span className="text-surface">https://mcp.genfeed.ai/mcp</span> and
            authenticates with the same key. Create one with{' '}
            <span className="text-surface">
              genfeed keys create -n &quot;my agent&quot; -p mcp
            </span>
            .
          </Text>
          <div className="grid grid-cols-1 gap-1.5 md:grid-cols-2">
            {MCP_SNIPPETS.map((snippet) => (
              <div key={snippet.title} className="gen-card-spotlight p-8">
                <Heading as="h3" className="font-semibold mb-4 text-surface">
                  {snippet.title}
                </Heading>
                <pre className="overflow-x-auto border gen-border bg-card p-4 text-sm text-surface">
                  {snippet.code}
                </pre>
              </div>
            ))}
          </div>
          <Text as="p" className="mt-6 text-sm text-surface/65">
            Any Streamable HTTP MCP client works — these two are the ones we
            document end to end.
          </Text>
        </section>

        {/* Skills */}
        <section className="gsap-section max-w-4xl mx-auto pb-16 px-6">
          <div className="gen-card-spotlight p-8">
            <div className="flex flex-row flex-col md:flex-row items-center gap-8">
              <div className="flex-shrink-0">
                <div className="flex size-20 items-center justify-center bg-card shadow-border">
                  <Blocks className="size-10 text-surface" />
                </div>
              </div>
              <div className="flex flex-col gap-3">
                <Heading as="h2" className="text-2xl font-bold text-surface">
                  Teach your agent the craft
                </Heading>
                <Text as="p" className="text-surface/65">
                  Genfeed publishes an open catalog of product skills — portable{' '}
                  <span className="text-surface">SKILL.md</span> packages that
                  encode a repeatable content discipline. They work in any agent
                  that reads the convention, with or without a Genfeed account.
                </Text>
                <pre className="overflow-x-auto border gen-border bg-card p-4 text-sm text-surface">
                  bunx skills add genfeedai/skills
                </pre>
              </div>
            </div>
          </div>
        </section>

        {/* What the agent can do */}
        <section className="gsap-section max-w-4xl mx-auto pb-16 px-6">
          <Heading as="h2" className="text-2xl font-bold text-center mb-8">
            What the agent can do
          </Heading>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-1.5">
            {CAPABILITIES.map((capability) => (
              <div
                key={capability}
                className="gen-contact-sheet flex items-center justify-center p-6 bg-fill/[0.02]"
              >
                <Text className="text-center text-sm font-semibold tracking-[-0.01em] text-surface/70">
                  {capability}
                </Text>
              </div>
            ))}
          </div>
        </section>

        {/* CTA */}
        <section className="max-w-4xl mx-auto pb-16 px-6">
          <div className="gen-card-spotlight p-12 text-center">
            <div className="flex justify-center mb-4">
              <Terminal className="size-8 text-surface" />
            </div>
            <Heading as="h2" className="text-2xl font-bold mb-2 text-surface">
              Start from the terminal
            </Heading>
            <Text as="p" className="text-surface/70 mb-6 max-w-lg mx-auto">
              Create an account, mint a key, and the CLI and MCP server are both
              live on the same workspace.
            </Text>
            <div className="flex flex-row items-center flex-wrap gap-4 justify-center">
              <ButtonTracked
                asChild
                size={ButtonSize.PUBLIC}
                trackingData={{ action: 'create_now' }}
                trackingName="agent_cta_click"
              >
                <a href={signUpHref} rel="noopener noreferrer" target="_blank">
                  Get an API key
                </a>
              </ButtonTracked>
              <ButtonTracked
                asChild
                size={ButtonSize.PUBLIC}
                trackingData={{ action: 'read_mcp_docs' }}
                trackingName="agent_cta_click"
                variant={ButtonVariant.SECONDARY}
              >
                <a
                  href={MCP_DOCS_URL}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  MCP setup guide
                </a>
              </ButtonTracked>
            </div>
            <Text as="p" className="mt-6 text-sm text-surface/65">
              <a
                className="underline underline-offset-4 hover:text-surface"
                href={SKILLS_DOCS_URL}
                rel="noopener noreferrer"
                target="_blank"
              >
                <BookOpen className="mr-2 inline size-4" />
                Browse the skill catalog
              </a>
            </Text>
          </div>
        </section>
      </PageLayout>
    </div>
  );
}
