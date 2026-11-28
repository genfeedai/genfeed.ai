import { getAppSignUpUrl } from '@data/app-links';
import {
  getPresetPagesInGroup,
  PRESET_GROUPS,
  type PresetPage,
} from '@data/presets.data';
import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { PresetCardPicture } from '@public/presets/preset-example-media';
import { Badge } from '@ui/primitives/badge';
import { Heading } from '@ui/typography/heading';
import { Text } from '@ui/typography/text';
import ButtonTracked from '@web-components/buttons/tracked/ButtonTracked';
import MarketingEntrance from '@web-components/MarketingEntrance';
import PageLayout from '@web-components/PageLayout';
import { ArrowRight } from 'lucide-react';
import Link from 'next/link';

function CatalogSignal({
  pages,
}: {
  pages: readonly PresetPage[];
}): React.ReactElement {
  const videoCount = pages.filter((page) => page.outputType === 'video').length;

  return (
    <div className="w-full max-w-xl border-l border-foreground/10 pl-7 sm:pl-10">
      <div className="mt-6 grid grid-cols-3 gap-3 sm:gap-5">
        {[
          { label: 'Presets', value: pages.length },
          { label: 'Video', value: videoCount },
          { label: 'Image and edit', value: pages.length - videoCount },
        ].map((item) => (
          <div key={item.label}>
            <Text className="text-4xl font-semibold tracking-[-0.02em] text-foreground sm:text-5xl">
              {item.value}
            </Text>
            <Text className="mt-3 block text-sm text-foreground/70">
              {item.label}
            </Text>
          </div>
        ))}
      </div>
      <Text className="mt-7 block max-w-md text-sm leading-6 text-foreground/60">
        Read from the open-source catalog the app and the store use. Each one
        shows a real run.
      </Text>
    </div>
  );
}

export function PresetCard({ page }: { page: PresetPage }): React.ReactElement {
  const [example] = page.examples;

  return (
    <li>
      <Link
        className="group block overflow-hidden rounded-lg bg-card shadow-border-strong transition-colors hover:bg-foreground/5"
        href={`/presets/${page.slug}`}
      >
        <div className="relative">
          {example ? (
            <PresetCardPicture example={example} label={page.label} />
          ) : null}
          {page.aspectRatio ? (
            <span className="absolute right-3 top-3">
              <Badge casing="normal" variant="overlay">
                {page.aspectRatio}
              </Badge>
            </span>
          ) : null}
        </div>
        <div className="p-5">
          <Heading as="h3" className="text-lg font-semibold text-foreground">
            {page.label}
          </Heading>
          <Text className="mt-2 block text-sm leading-6 text-foreground/70">
            {page.description}
          </Text>
        </div>
      </Link>
    </li>
  );
}

export default function PresetsContent({
  pages,
}: {
  pages: readonly PresetPage[];
}): React.ReactElement {
  return (
    <MarketingEntrance>
      <PageLayout
        compact
        description="Ready-made recipes for the posts, ads and clips that work. See what each one makes, copy the prompt, or run it on your brand."
        heroActions={
          <>
            <ButtonTracked
              asChild
              size={ButtonSize.PUBLIC}
              trackingData={{ action: 'start_creating' }}
              trackingName="presets_hero_click"
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
              trackingData={{ action: 'agent' }}
              trackingName="presets_hero_click"
              variant={ButtonVariant.SECONDARY}
            >
              <Link href="/agent">Use them from your agent</Link>
            </ButtonTracked>
          </>
        }
        heroVisual={<CatalogSignal pages={pages} />}
        title="Presets"
      >
        <div className="container mx-auto px-6 pb-16 md:pb-32">
          <div className="space-y-24">
            {PRESET_GROUPS.map((group) => {
              const groupPages = getPresetPagesInGroup(group.id, pages);
              if (groupPages.length === 0) return null;

              return (
                <section
                  className="grid gap-10 lg:grid-cols-[minmax(12rem,0.3fr)_minmax(0,1fr)] lg:gap-16"
                  key={group.id}
                >
                  <div>
                    <Heading
                      as="h2"
                      className="text-3xl font-semibold tracking-[-0.02em] text-foreground"
                    >
                      {group.title}
                    </Heading>
                    <Text className="mt-3 block text-sm text-foreground/60">
                      {group.blurb}
                    </Text>
                    <Text className="mt-3 block text-sm text-foreground/60">
                      {groupPages.length}{' '}
                      {groupPages.length === 1 ? 'preset' : 'presets'}
                    </Text>
                  </div>
                  <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {groupPages.map((page) => (
                      <PresetCard key={page.key} page={page} />
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
        </div>
      </PageLayout>
    </MarketingEntrance>
  );
}
