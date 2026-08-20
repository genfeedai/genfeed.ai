'use client';

import { APP_ROUTES } from '@genfeedai/constants';
import type { IconType } from '@genfeedai/interfaces/ui/icon.interface';
import { cn } from '@helpers/formatting/cn/cn.util';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import CardIcon from '@ui/card/icon/CardIcon';
import Container from '@ui/layout/container/Container';
import { PageSection } from '@ui/layout/page-section';
import {
  ArrowRight,
  CirclePlay,
  Folder,
  Image,
  Mic,
  Music,
  Sparkles,
  Video,
} from 'lucide-react';
import Link from 'next/link';
import { Suspense } from 'react';

import LibraryOverviewCreditNotice from './library-overview-credit-notice';

interface LibraryCategoryCardConfig {
  description: string;
  href: string;
  icon: IconType;
  id: string;
  kicker: string;
  label: string;
  toneClassName: string;
}

const VISUAL_CATEGORY_CARDS: LibraryCategoryCardConfig[] = [
  {
    description: 'Motion-ready edits, exports, and reusable clips.',
    href: APP_ROUTES.LIBRARY.VIDEOS,
    icon: Video,
    id: 'videos',
    kicker: 'Motion',
    label: 'Videos',
    toneClassName: 'bg-white/[0.05] text-white/80',
  },
  {
    description: 'Stills, references, and brand visual building blocks.',
    href: APP_ROUTES.LIBRARY.IMAGES,
    icon: Image,
    id: 'images',
    kicker: 'Still',
    label: 'Images',
    toneClassName: 'bg-white/[0.05] text-white/80',
  },
  {
    description: 'Short-form loops and reaction-ready motion snippets.',
    href: APP_ROUTES.LIBRARY.GIFS,
    icon: CirclePlay,
    id: 'gifs',
    kicker: 'Loop',
    label: 'GIFs',
    toneClassName: 'bg-white/[0.05] text-white/80',
  },
  {
    description: 'Character presets and presenter surfaces for video creation.',
    href: APP_ROUTES.LIBRARY.AVATARS,
    icon: Sparkles,
    id: 'avatars',
    kicker: 'Persona',
    label: 'Avatars',
    toneClassName: 'bg-white/[0.05] text-white/80',
  },
];

const UTILITY_CATEGORY_CARDS: LibraryCategoryCardConfig[] = [
  {
    description: 'Voice presets and cloned speakers ready for narration.',
    href: APP_ROUTES.LIBRARY.VOICES,
    icon: Mic,
    id: 'voices',
    kicker: 'Voice',
    label: 'Voices',
    toneClassName: 'bg-white/[0.05] text-white/80',
  },
  {
    description: 'Music cues and background tracks organized for reuse.',
    href: APP_ROUTES.LIBRARY.MUSIC,
    icon: Music,
    id: 'music',
    kicker: 'Audio',
    label: 'Music',
    toneClassName: 'bg-white/[0.05] text-white/80',
  },
  {
    description:
      'Captions and copy-ready text assets for publishing workflows.',
    href: APP_ROUTES.LIBRARY.CAPTIONS,
    icon: Folder,
    id: 'captions',
    kicker: 'Text',
    label: 'Captions',
    toneClassName: 'bg-white/[0.05] text-white/80',
  },
];

function LibraryCategoryTile({
  config,
  testId,
}: {
  config: LibraryCategoryCardConfig;
  testId: string;
}) {
  const { href } = useOrgUrl();
  const Icon = config.icon;
  const titleId = `${config.id}-library-tile-title`;
  const descriptionId = `${config.id}-library-tile-description`;

  return (
    <Link
      href={href(config.href)}
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      data-testid={testId}
      className={cn(
        'group block h-full rounded-card bg-card text-card-foreground shadow-border transition-[background-color,box-shadow] duration-200 ease-out',
        'hover:bg-white/[0.02] hover:shadow-border-strong',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
      )}
    >
      <article className="flex h-full flex-col gap-5 p-4">
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <CardIcon
              icon={Icon}
              className={cn(
                'flex h-10 w-10 items-center justify-center border border-white/[0.08]',
                config.toneClassName,
              )}
              iconClassName="h-5 w-5"
            />
            <div className="min-w-0">
              <p className="text-2xs font-semibold uppercase tracking-[0.18em] text-foreground/40">
                {config.kicker}
              </p>
              <h2
                id={titleId}
                className="mt-1 text-base font-semibold tracking-[-0.02em] text-foreground"
              >
                {config.label}
              </h2>
            </div>
          </div>

          <p
            id={descriptionId}
            className="text-sm leading-6 text-foreground/60"
          >
            {config.description}
          </p>
        </div>

        <div className="mt-auto flex items-center justify-between border-t border-white/[0.06] pt-4 text-xs font-semibold uppercase tracking-[0.12em] text-foreground/45 transition-colors group-hover:text-foreground/75">
          <span>Browse</span>
          <ArrowRight
            aria-hidden="true"
            className="size-4 transition-transform duration-200 group-hover:translate-x-1"
          />
        </div>
      </article>
    </Link>
  );
}

function LibrarySection({
  cards,
  description,
  title,
}: {
  cards: LibraryCategoryCardConfig[];
  description: string;
  title: string;
}) {
  return (
    <PageSection title={title} description={description}>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {cards.map((category) => (
          <LibraryCategoryTile
            key={category.id}
            config={category}
            testId={`library-category-${category.id}`}
          />
        ))}
      </div>
    </PageSection>
  );
}

export default function LibraryOverviewPage() {
  return (
    <Container
      label="Library"
      description="Browse reusable assets across your workspace."
      icon={Folder}
    >
      <div data-testid="library-landing" className="space-y-8">
        {/*
          Credit notice returns null when balance is fine. Do not wrap it in a
          permanent shell — space-y still margins the next sibling after an
          empty div, which looked like a dead sub-topbar gap.
        */}
        <Suspense fallback={null}>
          <LibraryOverviewCreditNotice />
        </Suspense>

        <LibrarySection
          title="Visual Assets"
          description="Images, videos, GIFs, and avatars each open into a focused category view without the extra landing-page theatrics."
          cards={VISUAL_CATEGORY_CARDS}
        />

        <LibrarySection
          title="Utility Assets"
          description="Voices, music, and captions stay in Library too, but open in layouts that match the media instead of pretending everything is a gallery."
          cards={UTILITY_CATEGORY_CARDS}
        />
      </div>
    </Container>
  );
}
