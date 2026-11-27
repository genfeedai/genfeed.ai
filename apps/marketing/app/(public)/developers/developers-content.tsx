import { getAgentClientChannels } from '@data/agent-client-channels.data';
import { getAppSignUpUrl } from '@data/app-links';
import {
  CALL_GROUPS,
  DEVELOPERS_FAQ,
  DOCS_API_KEYS_URL,
  DOCS_API_URL,
  DOCS_ORIGIN,
  DOCS_REFERENCE_URL,
  QUICK_START_TABS,
  SELF_HOST_COMMAND,
} from '@data/developers.data';
import { ButtonSize, ButtonVariant, CardPadding } from '@genfeedai/contracts';
import { ONBOARDING_SIGNUP_GIFT_CREDITS } from '@genfeedai/contracts/types';
import { GithubIcon } from '@genfeedai/helpers/ui/icons/brands';
import {
  creditPackPrice,
  formatPrice,
  IMAGE_CREDIT_COSTS,
  VIDEO_CREDIT_COSTS,
  WEBSITE_CREDIT_PACKS,
} from '@genfeedai/pricing';
import { formatNumberWithCommas } from '@helpers/formatting/format/format.helper';
import CommandBlock from '@public/agent-clients/agent-client-command-block';
import { EnvironmentService } from '@services/core/environment.service';
import Card from '@ui/card/Card';
import {
  TabsContent,
  TabsList,
  TabsRoot,
  TabsTrigger,
} from '@ui/primitives/tabs';
import { Heading } from '@ui/typography/heading';
import { Text } from '@ui/typography/text';
import ButtonTracked from '@web-components/buttons/tracked/ButtonTracked';
import FaqGrid from '@web-components/content/FaqGrid';
import { HOME_OUTPUT_CAROUSEL_ASSETS } from '@web-components/home/_assets';
import MarketingEntrance from '@web-components/MarketingEntrance';
import PageLayout from '@web-components/PageLayout';
import { ArrowRight, BookOpen, Check } from 'lucide-react';
import Link from 'next/link';

const GITHUB_URL = EnvironmentService.github.core;

const OUTPUT_ASSET = HOME_OUTPUT_CAROUSEL_ASSETS.find(
  (asset) => asset.format === 'Short-form video',
);

const SECTION = 'gsap-section mx-auto max-w-6xl px-6 pb-16';
const LINK = 'font-semibold text-foreground underline-offset-4 hover:underline';

function QuickStart(): React.ReactElement {
  return (
    <div className="overflow-hidden rounded-lg bg-card shadow-border-strong">
      <TabsRoot defaultValue={QUICK_START_TABS[0].id}>
        <div className="border-b border-foreground/5 bg-background/90 p-2">
          <TabsList aria-label="Quick start">
            {QUICK_START_TABS.map((tab) => (
              <TabsTrigger className="flex-1" key={tab.id} value={tab.id}>
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
        {QUICK_START_TABS.map((tab) => (
          <TabsContent
            className="flex flex-col gap-3 p-4"
            key={tab.id}
            value={tab.id}
          >
            {tab.blocks.map((block) => (
              <CommandBlock
                key={block.label}
                label={block.label}
                value={block.value}
              />
            ))}
            {tab.response ? (
              <CommandBlock
                label={tab.response.label}
                value={tab.response.value}
              />
            ) : null}
            <Text as="p" className="text-sm text-foreground/70">
              <span className="font-semibold text-foreground">Returns. </span>
              {tab.returns}
            </Text>
          </TabsContent>
        ))}
      </TabsRoot>
    </div>
  );
}

function FinishedOutput(): React.ReactElement | null {
  if (!OUTPUT_ASSET) {
    return null;
  }

  return (
    <section className={SECTION}>
      <Heading as="h2" className="mb-2 text-2xl font-semibold text-foreground">
        What one call sequence makes
      </Heading>
      <Text as="p" className="mb-8 max-w-3xl text-foreground/70">
        A brief becomes a finished vertical clip and a draft post. The clip
        comes from <code>generate_media</code>, the post from{' '}
        <code>save_post</code>, and both wait in your review queue.
      </Text>
      <div className="grid grid-cols-1 gap-1.5 md:grid-cols-[minmax(0,320px)_1fr]">
        <div className="overflow-hidden rounded-lg bg-card shadow-border-strong">
          <video
            aria-label={OUTPUT_ASSET.alt}
            className="aspect-[9/16] w-full object-cover"
            controls
            loop
            muted
            playsInline
            poster={OUTPUT_ASSET.poster}
            preload="none"
          >
            <source src={OUTPUT_ASSET.webm} type="video/webm" />
            <source src={OUTPUT_ASSET.mp4} type="video/mp4" />
          </video>
        </div>
        <Card padding={CardPadding.LG}>
          <div className="flex flex-col justify-center gap-4">
            <ol className="flex flex-col gap-4">
              {[
                ['get_context', 'Reads the brand, its voice and its accounts.'],
                [
                  'generate_media',
                  'Makes the clip. Poll check_job until done.',
                ],
                ['save_post', 'Attaches the clip to a draft with its caption.'],
                [
                  'Review',
                  'You approve it in Genfeed. schedule_release runs only when you ask.',
                ],
              ].map(([call, detail], index) => (
                <li className="flex gap-4" key={call}>
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-full border border-foreground/10 text-sm font-semibold text-foreground/70">
                    {index + 1}
                  </span>
                  <span className="flex flex-col">
                    <span className="font-semibold text-foreground">
                      {call}
                    </span>
                    <span className="text-sm text-foreground/70">{detail}</span>
                  </span>
                </li>
              ))}
            </ol>
            <Text as="p" className="text-xs text-foreground/50">
              Example clip from Genfeed&rsquo;s own video pipeline, the one
              these calls use.
            </Text>
          </div>
        </Card>
      </div>
    </section>
  );
}

function Costs(): React.ReactElement {
  const smallestPack = WEBSITE_CREDIT_PACKS[0];
  const { maxCredits, minCredits } = IMAGE_CREDIT_COSTS.image1kTo2k;
  const rows = [
    {
      cost: `${formatNumberWithCommas(minCredits)}–${formatNumberWithCommas(maxCredits)} credits`,
      label: 'Image, 1K to 2K',
    },
    {
      cost: `${formatNumberWithCommas(IMAGE_CREDIT_COSTS.image4k)} credits`,
      label: 'Image, 4K',
    },
    {
      cost: `${formatNumberWithCommas(VIDEO_CREDIT_COSTS.video8s)} credits`,
      label: 'Short video, 8 seconds',
    },
  ];

  return (
    <section className={SECTION} id="cost">
      <Heading as="h2" className="mb-2 text-2xl font-semibold text-foreground">
        What it costs a builder
      </Heading>
      <Text as="p" className="mb-8 max-w-3xl text-foreground/70">
        On the hosted API you pay in credits for what you generate. Drafting,
        scheduling and reading analytics generate nothing. Self-hosted, there is
        no platform fee: you pay your own infrastructure and model providers.
      </Text>
      <div className="grid grid-cols-1 gap-1.5 md:grid-cols-2">
        <Card padding={CardPadding.LG}>
          <Heading as="h3" className="mb-4 font-semibold text-foreground">
            Per generation
          </Heading>
          <dl className="flex flex-col gap-3">
            {rows.map((row) => (
              <div
                className="flex items-baseline justify-between gap-4 border-b border-foreground/10 pb-3 last:border-0 last:pb-0"
                key={row.label}
              >
                <dt className="text-sm text-foreground/70">{row.label}</dt>
                <dd className="text-sm font-semibold text-foreground">
                  {row.cost}
                </dd>
              </div>
            ))}
          </dl>
        </Card>
        <Card padding={CardPadding.LG}>
          <div className="flex flex-col gap-3">
            <Heading as="h3" className="font-semibold text-foreground">
              Pay as you go
            </Heading>
            <Text as="p" className="text-sm text-foreground/70">
              {ONBOARDING_SIGNUP_GIFT_CREDITS} credits when you sign up. Credit
              packs start at {formatPrice(creditPackPrice(smallestPack))}, with
              no subscription.
            </Text>
            <Link className={LINK} href="/pricing">
              See pricing
            </Link>
          </div>
        </Card>
      </div>
    </section>
  );
}

export default function DevelopersContent(): React.ReactElement {
  const channels = getAgentClientChannels();

  return (
    <MarketingEntrance>
      <PageLayout
        compact
        description="Call Genfeed from your own code to draft posts, generate images and video, and schedule them to connected channels. REST, CLI and MCP, hosted or self-hosted."
        heroActions={
          <>
            <ButtonTracked
              asChild
              size={ButtonSize.PUBLIC}
              trackingData={{ action: 'api_keys' }}
              trackingName="developers_hero_click"
            >
              <Link
                href={DOCS_API_KEYS_URL}
                rel="noopener noreferrer"
                target="_blank"
              >
                Get an API key
                <ArrowRight className="size-4" />
              </Link>
            </ButtonTracked>
            <ButtonTracked
              asChild
              size={ButtonSize.PUBLIC}
              trackingData={{ action: 'api_reference' }}
              trackingName="developers_hero_click"
              variant={ButtonVariant.SECONDARY}
            >
              <Link
                href={DOCS_REFERENCE_URL}
                rel="noopener noreferrer"
                target="_blank"
              >
                <BookOpen className="size-4" />
                API reference
              </Link>
            </ButtonTracked>
          </>
        }
        heroVisual={<QuickStart />}
        title="A social media API for your code and your agents"
      >
        <FinishedOutput />

        <section className={SECTION}>
          <Heading
            as="h2"
            className="mb-2 text-2xl font-semibold text-foreground"
          >
            What you can call
          </Heading>
          <Text as="p" className="mb-8 max-w-3xl text-foreground/70">
            Nine groups, each with the MCP tool, the CLI command and the page in
            the docs that covers it.
          </Text>
          <div className="gsap-grid grid grid-cols-1 gap-1.5 md:grid-cols-2 lg:grid-cols-3">
            {CALL_GROUPS.map((group) => (
              <Card padding={CardPadding.MD} key={group.title}>
                <div className="flex flex-col gap-3">
                  <Heading as="h3" className="font-semibold text-foreground">
                    {group.title}
                  </Heading>
                  <Text as="p" className="text-sm text-foreground/70">
                    {group.description}
                  </Text>
                  <Text as="p" className="mt-auto text-xs text-foreground/60">
                    <code>{group.mcp}</code>
                    {group.cli ? (
                      <>
                        {' · '}
                        <code>{group.cli}</code>
                      </>
                    ) : null}
                  </Text>
                  <a
                    className={LINK}
                    href={group.docsHref}
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    Read the docs
                  </a>
                </div>
              </Card>
            ))}
          </div>
        </section>

        <section className={SECTION}>
          <Heading
            as="h2"
            className="mb-2 text-2xl font-semibold text-foreground"
          >
            Limits, stated plainly
          </Heading>
          <Text as="p" className="mb-8 max-w-3xl text-foreground/70">
            What works today, and what does not.
          </Text>
          <div className="grid grid-cols-1 gap-1.5 md:grid-cols-3">
            <Card padding={CardPadding.LG}>
              <div className="flex flex-col gap-3">
                <Heading as="h3" className="font-semibold text-foreground">
                  Media depends on the client
                </Heading>
                <Text as="p" className="text-sm text-foreground/70">
                  Claude uses the content connector: drafts, scheduling and
                  analytics. Clients on the standard MCP connector can also
                  generate media. The REST API and the CLI generate media with
                  any key that has the scopes.
                </Text>
                <Link className={LINK} href="/agent">
                  Compare clients
                </Link>
              </div>
            </Card>
            <Card padding={CardPadding.LG}>
              <div className="flex flex-col gap-3">
                <Heading as="h3" className="font-semibold text-foreground">
                  Channels that publish
                </Heading>
                <ul className="flex flex-wrap gap-x-3 gap-y-1 text-sm">
                  {channels.map((channel) => (
                    <li key={channel.slug}>
                      <Link
                        className="text-foreground/70 hover:text-foreground"
                        href={`/integrations/${channel.slug}`}
                      >
                        {channel.name}
                      </Link>
                    </li>
                  ))}
                </ul>
                <Text as="p" className="text-sm text-foreground/70">
                  Connect the account in Genfeed first.
                </Text>
              </div>
            </Card>
            <Card padding={CardPadding.LG}>
              <div className="flex flex-col gap-3">
                <Heading as="h3" className="font-semibold text-foreground">
                  Nothing posts without approval
                </Heading>
                <Text as="p" className="text-sm text-foreground/70">
                  By default every draft waits for you. The MCP key preset
                  leaves out direct publishing, and on REST a key can be limited
                  to drafts. Auto-publish is a setting you switch on per
                  channel.
                </Text>
                <a
                  className={LINK}
                  href={DOCS_API_KEYS_URL}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  Key scopes
                </a>
              </div>
            </Card>
          </div>
        </section>

        <section className={SECTION} id="open-source">
          <Heading
            as="h2"
            className="mb-2 text-2xl font-semibold text-foreground"
          >
            Open source, and yours to run
          </Heading>
          <Text as="p" className="mb-8 max-w-3xl text-foreground/70">
            The API, the MCP server, the CLI and the workflow engine are in one
            AGPL-3.0 repository. One command installs the stack on your own
            infrastructure. Add your provider keys and point your agent at your
            own MCP endpoint.
          </Text>
          <div className="grid grid-cols-1 items-start gap-1.5 md:grid-cols-2">
            <CommandBlock label="Install" value={SELF_HOST_COMMAND} />
            <div className="flex flex-wrap gap-4">
              <ButtonTracked
                asChild
                size={ButtonSize.PUBLIC}
                trackingData={{ action: 'view_github' }}
                trackingName="developers_open_source_click"
                variant={ButtonVariant.SECONDARY}
              >
                <Link
                  href={GITHUB_URL}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  <GithubIcon className="size-4" />
                  View on GitHub
                </Link>
              </ButtonTracked>
              <ButtonTracked
                asChild
                size={ButtonSize.PUBLIC}
                trackingData={{ action: 'self_hosted' }}
                trackingName="developers_open_source_click"
                variant={ButtonVariant.SECONDARY}
              >
                <Link href="/self-hosted">
                  <Check className="size-4" />
                  Self-hosting guide
                </Link>
              </ButtonTracked>
            </div>
          </div>
        </section>

        <Costs />

        <section className={SECTION}>
          <Card padding={CardPadding.LG}>
            <div className="flex flex-col gap-3">
              <Heading
                as="h2"
                className="text-xl font-semibold text-foreground"
              >
                Use an agent and write no code?
              </Heading>
              <Text as="p" className="text-foreground/70">
                This page is for people who call Genfeed from their own code. To
                brief Claude, ChatGPT, Codex or Cursor in plain language,
                connect the agent instead.
              </Text>
              <Link className={LINK} href="/agent">
                Use Genfeed from your agent
              </Link>
            </div>
          </Card>
        </section>

        <section className="gsap-section mx-auto max-w-4xl px-6 pb-16">
          <Heading
            as="h2"
            className="mb-8 text-center text-2xl font-semibold text-foreground"
          >
            Questions developers ask
          </Heading>
          <FaqGrid items={[...DEVELOPERS_FAQ]} />
        </section>

        <section className="mx-auto max-w-4xl px-6 pb-16">
          <div className="gen-card-spotlight p-6 text-center sm:p-12">
            <Heading
              as="h2"
              className="mb-2 text-2xl font-semibold text-foreground"
            >
              Make the first call
            </Heading>
            <Text as="p" className="mx-auto mb-6 max-w-lg text-foreground/70">
              Create a key, send one draft, and review it in Genfeed. The full
              reference is in{' '}
              <a
                className={LINK}
                href={DOCS_ORIGIN}
                rel="noopener noreferrer"
                target="_blank"
              >
                the docs
              </a>
              .
            </Text>
            <div className="flex flex-wrap items-center justify-center gap-4">
              <ButtonTracked
                asChild
                size={ButtonSize.PUBLIC}
                trackingData={{ action: 'start' }}
                trackingName="developers_cta_click"
              >
                <Link
                  href={getAppSignUpUrl()}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  Start creating
                </Link>
              </ButtonTracked>
              <ButtonTracked
                asChild
                size={ButtonSize.PUBLIC}
                trackingData={{ action: 'api_docs' }}
                trackingName="developers_cta_click"
                variant={ButtonVariant.SECONDARY}
              >
                <Link
                  href={DOCS_API_URL}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  API overview
                </Link>
              </ButtonTracked>
            </div>
          </div>
        </section>
      </PageLayout>
    </MarketingEntrance>
  );
}
