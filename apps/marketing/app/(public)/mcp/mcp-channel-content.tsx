import { agentClients, GENFEED_MCP_DOCS_URL } from '@data/agent-clients.data';
import { getAppSignUpUrl } from '@data/app-links';
import { MCP_CONFIG_SNIPPET } from '@data/developers.data';
import { getIntegrationBySlug } from '@data/integrations.data';
import {
  MCP_CHANNEL_SLUGS,
  MCP_CLAUDE_CODE_COMMAND,
  type McpChannelPage,
  singularNoun,
} from '@data/mcp-channels.data';
import { ButtonSize, ButtonVariant, CardPadding } from '@genfeedai/contracts';
import CommandBlock from '@public/agent-clients/agent-client-command-block';
import Card from '@ui/card/Card';
import { Heading } from '@ui/typography/heading';
import { Text } from '@ui/typography/text';
import ButtonTracked from '@web-components/buttons/tracked/ButtonTracked';
import FaqGrid from '@web-components/content/FaqGrid';
import { HOME_OUTPUT_CAROUSEL_ASSETS } from '@web-components/home/_assets';
import MarketingEntrance from '@web-components/MarketingEntrance';
import PageLayout from '@web-components/PageLayout';
import { ArrowRight, Check, X } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';

const SECTION = 'gsap-section mx-auto max-w-6xl px-6 pb-16';
const LINK = 'font-semibold text-foreground underline-offset-4 hover:underline';

function ConnectBlocks(): React.ReactElement {
  return (
    <div className="flex flex-col gap-3">
      <CommandBlock label="Add to any MCP client" value={MCP_CONFIG_SNIPPET} />
      <CommandBlock label="Claude Code" value={MCP_CLAUDE_CODE_COMMAND} />
    </div>
  );
}

function FinishedPiece({
  page,
}: {
  page: McpChannelPage;
}): React.ReactElement | null {
  const asset = HOME_OUTPUT_CAROUSEL_ASSETS.find(
    (item) => item.format === page.proofFormat,
  );

  if (!asset) {
    return null;
  }

  const singular = singularNoun(page.noun);
  const isVideo = page.proofFormat === 'Short-form video';

  return (
    <section className={SECTION}>
      <Heading as="h2" className="mb-2 text-2xl font-semibold text-foreground">
        What the agent hands back
      </Heading>
      <Text as="p" className="mb-8 max-w-3xl text-foreground/70">
        You ask in plain language. The agent writes the {singular}, generates
        its media and saves it as a draft in Genfeed, where you review it before
        it goes to {page.name}.
      </Text>
      <div className="grid grid-cols-1 gap-1.5 md:grid-cols-[minmax(0,320px)_1fr]">
        <div className="overflow-hidden rounded-lg bg-card shadow-border-strong">
          {isVideo ? (
            <video
              aria-label={asset.alt}
              className="aspect-[9/16] w-full object-cover"
              controls
              loop
              muted
              playsInline
              poster={asset.poster}
              preload="none"
            >
              <source src={asset.webm} type="video/webm" />
              <source src={asset.mp4} type="video/mp4" />
            </video>
          ) : (
            <Image
              alt={asset.alt}
              className="aspect-[4/5] w-full object-cover"
              height={500}
              src={asset.poster}
              unoptimized
              width={400}
            />
          )}
        </div>
        <Card padding={CardPadding.LG}>
          <div className="flex flex-col gap-4">
            <Text
              as="p"
              className="text-xs font-semibold uppercase tracking-label text-foreground/60"
            >
              You ask
            </Text>
            <Text as="p" className="text-lg text-foreground">
              &ldquo;{page.prompts[0]}&rdquo;
            </Text>
            <Text as="p" className="text-sm text-foreground/70">
              Status in Genfeed: draft, waiting for your approval.
            </Text>
            <Text as="p" className="text-xs text-foreground/50">
              Example media from Genfeed&rsquo;s own generation pipeline.
              Nothing on this page was posted to {page.name}.
            </Text>
          </div>
        </Card>
      </div>
    </section>
  );
}

export default function McpChannelContent({
  page,
}: {
  page: McpChannelPage;
}): React.ReactElement {
  const otherChannels = MCP_CHANNEL_SLUGS.filter(
    (slug) => slug !== page.channelSlug,
  );

  return (
    <MarketingEntrance>
      <PageLayout
        compact
        description={page.description}
        heroActions={
          <>
            <ButtonTracked
              asChild
              size={ButtonSize.PUBLIC}
              trackingData={{ action: 'start', channel: page.channelSlug }}
              trackingName="mcp_channel_hero_click"
            >
              <Link
                href={getAppSignUpUrl()}
                rel="noopener noreferrer"
                target="_blank"
              >
                Start creating
                <ArrowRight className="size-4" />
              </Link>
            </ButtonTracked>
            <ButtonTracked
              asChild
              size={ButtonSize.PUBLIC}
              trackingData={{ action: 'docs', channel: page.channelSlug }}
              trackingName="mcp_channel_hero_click"
              variant={ButtonVariant.SECONDARY}
            >
              <a
                href={GENFEED_MCP_DOCS_URL}
                rel="noopener noreferrer"
                target="_blank"
              >
                MCP docs
              </a>
            </ButtonTracked>
          </>
        }
        heroVisual={<ConnectBlocks />}
        title={`${page.name} MCP server`}
      >
        <section className={SECTION}>
          <Heading
            as="h2"
            className="mb-2 text-2xl font-semibold text-foreground"
          >
            What your agent can do on {page.name}
          </Heading>
          <Text as="p" className="mb-8 max-w-3xl text-foreground/70">
            Connect your {page.name} account in Genfeed once. Your agent reaches
            it through the Genfeed MCP server and never sees your {page.name}{' '}
            credentials.
          </Text>
          <div className="grid grid-cols-1 gap-1.5 md:grid-cols-2">
            <Card padding={CardPadding.LG}>
              <Heading as="h3" className="mb-4 font-semibold text-foreground">
                It can
              </Heading>
              <ul className="flex flex-col gap-3">
                {page.canDo.map((item) => (
                  <li
                    className="flex gap-3 text-sm text-foreground/80"
                    key={item}
                  >
                    <Check
                      aria-hidden
                      className="mt-0.5 size-4 shrink-0 text-success"
                    />
                    {item}
                  </li>
                ))}
              </ul>
            </Card>
            <Card padding={CardPadding.LG}>
              <Heading as="h3" className="mb-4 font-semibold text-foreground">
                Limits, stated plainly
              </Heading>
              <ul className="flex flex-col gap-3">
                {[
                  `Nothing goes to ${page.name} without your approval, unless you switch on auto-publish for the channel.`,
                  ...page.limits,
                  'Claude uses the content connector for drafts, scheduling and analytics. Clients on the standard MCP connector can also generate media.',
                ].map((item) => (
                  <li
                    className="flex gap-3 text-sm text-foreground/80"
                    key={item}
                  >
                    <X
                      aria-hidden
                      className="mt-0.5 size-4 shrink-0 text-foreground/50"
                    />
                    {item}
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        </section>

        <FinishedPiece page={page} />

        <section className={SECTION}>
          <Heading
            as="h2"
            className="mb-2 text-2xl font-semibold text-foreground"
          >
            What to ask for
          </Heading>
          <div className="mt-6 grid grid-cols-1 gap-1.5 md:grid-cols-3">
            {page.prompts.map((prompt) => (
              <Card key={prompt} padding={CardPadding.LG}>
                <Text as="p" className="text-base text-foreground/80">
                  &ldquo;{prompt}&rdquo;
                </Text>
              </Card>
            ))}
          </div>
        </section>

        <section className={SECTION}>
          <Heading
            as="h2"
            className="mb-2 text-2xl font-semibold text-foreground"
          >
            Connect {page.name} from your agent
          </Heading>
          <Text as="p" className="mb-6 max-w-3xl text-foreground/70">
            The same server works in every client. Each page below has the setup
            steps for that client.
          </Text>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {agentClients.map((client) => (
              <li key={client.slug}>
                <Link
                  className={LINK}
                  href={`/${client.slug}/${page.channelSlug}`}
                >
                  {client.name}
                </Link>
              </li>
            ))}
          </ul>
          <Text as="p" className="mt-6 text-sm text-foreground/70">
            More on{' '}
            <Link className={LINK} href={`/integrations/${page.channelSlug}`}>
              Genfeed for {page.name}
            </Link>
            . Calling it from your own code?{' '}
            <Link className={LINK} href="/developers">
              Developer hub
            </Link>
            .
          </Text>
        </section>

        <section className="gsap-section mx-auto max-w-4xl px-6 pb-16">
          <Heading
            as="h2"
            className="mb-8 text-center text-2xl font-semibold text-foreground"
          >
            {page.name} MCP server: frequently asked questions
          </Heading>
          <FaqGrid items={[...page.faq]} />
        </section>

        <section className={SECTION}>
          <Heading
            as="h2"
            className="mb-4 text-2xl font-semibold text-foreground"
          >
            Other channels
          </Heading>
          <ul className="flex flex-wrap gap-x-6 gap-y-2">
            {otherChannels.map((slug) => (
              <li key={slug}>
                <Link className={LINK} href={`/mcp/${slug}`}>
                  {getIntegrationBySlug(slug)?.name ?? slug} MCP server
                </Link>
              </li>
            ))}
            <li>
              <Link className={LINK} href="/mcp">
                Every channel
              </Link>
            </li>
          </ul>
        </section>
      </PageLayout>
    </MarketingEntrance>
  );
}
