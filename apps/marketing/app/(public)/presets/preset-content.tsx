import { GENFEED_MCP_DOCS_URL } from '@data/agent-clients.data';
import { getAppSignUpUrl } from '@data/app-links';
import type { PresetPage } from '@data/presets.data';
import type { PresetUseCaseLink } from '@data/use-case-presets.data';
import { ButtonSize, ButtonVariant, CardPadding } from '@genfeedai/contracts';
import CommandBlock from '@public/agent-clients/agent-client-command-block';
import PresetExampleMedia from '@public/presets/preset-example-media';
import Card from '@ui/card/Card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@ui/primitives/table';
import { Heading } from '@ui/typography/heading';
import { Text } from '@ui/typography/text';
import ButtonTracked from '@web-components/buttons/tracked/ButtonTracked';
import FaqGrid from '@web-components/content/FaqGrid';
import MarketingEntrance from '@web-components/MarketingEntrance';
import PageLayout from '@web-components/PageLayout';
import { ArrowRight } from 'lucide-react';
import Link from 'next/link';

const SECTION = 'gsap-section mx-auto max-w-6xl px-6 pb-16';
const LINK = 'font-semibold text-foreground underline-offset-4 hover:underline';

export default function PresetContent({
  page,
  related,
  useCases = [],
}: {
  page: PresetPage;
  related: readonly PresetPage[];
  /** The audience pages that name this preset. */
  useCases?: readonly PresetUseCaseLink[];
}): React.ReactElement {
  const [first] = page.examples;

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
              trackingData={{ action: 'use_preset', preset: page.key }}
              trackingName="preset_hero_click"
            >
              <Link
                href={getAppSignUpUrl()}
                rel="noopener noreferrer"
                target="_blank"
              >
                Use this preset
                <ArrowRight className="size-4" />
              </Link>
            </ButtonTracked>
            <ButtonTracked
              asChild
              size={ButtonSize.PUBLIC}
              trackingData={{ action: 'all_presets', preset: page.key }}
              trackingName="preset_hero_click"
              variant={ButtonVariant.SECONDARY}
            >
              <Link href="/presets">All presets</Link>
            </ButtonTracked>
          </>
        }
        heroVisual={
          first ? (
            <div className="w-full max-w-xs overflow-hidden rounded-lg shadow-border-strong">
              <PresetExampleMedia example={first} isPriority />
            </div>
          ) : undefined
        }
        title={page.label}
      >
        <section className={SECTION}>
          <Heading
            as="h2"
            className="mb-2 text-2xl font-semibold text-foreground"
          >
            What it makes
          </Heading>
          <Text as="p" className="mb-8 max-w-3xl text-foreground/70">
            {page.examples.length === 1
              ? 'A real result made with this preset.'
              : `${page.examples.length} real results made with this preset.`}
          </Text>
          <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-3">
            {page.examples.map((example) => (
              <li
                className="overflow-hidden rounded-lg bg-card shadow-border-strong"
                key={example.url}
              >
                <PresetExampleMedia example={example} />
                <Text className="block p-4 text-sm text-foreground/70">
                  {example.alt}
                </Text>
              </li>
            ))}
          </ul>
        </section>

        <section className={SECTION}>
          <Heading
            as="h2"
            className="mb-2 text-2xl font-semibold text-foreground"
          >
            The recipe
          </Heading>
          <Text as="p" className="mb-8 max-w-3xl text-foreground/70">
            The same definition the app runs, from the open-source catalog. Copy
            it and reuse it anywhere.
          </Text>
          <div className="grid grid-cols-1 gap-1.5 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
            <CommandBlock label="Recipe" value={page.recipeText} />
            <Card padding={CardPadding.NONE}>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Setting</TableHead>
                    <TableHead>Value</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {page.settings.map(([name, value]) => (
                    <TableRow key={`${name}-${value}`}>
                      <TableCell>{name}</TableCell>
                      <TableCell>{value}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          </div>
        </section>

        <section className={SECTION}>
          <Heading
            as="h2"
            className="mb-2 text-2xl font-semibold text-foreground"
          >
            Run it from your agent
          </Heading>
          <Text as="p" className="mb-6 max-w-3xl text-foreground/70">
            Connect Genfeed to Claude, ChatGPT or any MCP client, then ask for
            the preset by name.{' '}
            <a
              className={LINK}
              href={GENFEED_MCP_DOCS_URL}
              rel="noopener noreferrer"
              target="_blank"
            >
              MCP docs
            </a>
          </Text>
          <div className="flex flex-col gap-3">
            <CommandBlock label="Ask your agent" value={page.agentPrompt} />
            <CommandBlock label="Read it through MCP" value={page.mcpCall} />
          </div>
        </section>

        {useCases.length > 0 ? (
          <section className={SECTION}>
            <Heading
              as="h2"
              className="mb-4 text-2xl font-semibold text-foreground"
            >
              Used for
            </Heading>
            <ul className="flex flex-wrap gap-x-6 gap-y-2">
              {useCases.map((useCase) => (
                <li key={useCase.slug}>
                  <Link className={LINK} href={`/use-cases/${useCase.slug}`}>
                    {useCase.audience}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section className="gsap-section mx-auto max-w-4xl px-6 pb-16">
          <Heading
            as="h2"
            className="mb-8 text-center text-2xl font-semibold text-foreground"
          >
            {page.label} preset: frequently asked questions
          </Heading>
          <FaqGrid items={[...page.faq]} />
        </section>

        <section className={SECTION}>
          <Heading
            as="h2"
            className="mb-4 text-2xl font-semibold text-foreground"
          >
            More presets like this
          </Heading>
          <ul className="flex flex-wrap gap-x-6 gap-y-2">
            {related.map((other) => (
              <li key={other.key}>
                <Link className={LINK} href={`/presets/${other.slug}`}>
                  {other.label}
                </Link>
              </li>
            ))}
            <li>
              <Link className={LINK} href="/presets">
                Every preset
              </Link>
            </li>
          </ul>
        </section>
      </PageLayout>
    </MarketingEntrance>
  );
}
