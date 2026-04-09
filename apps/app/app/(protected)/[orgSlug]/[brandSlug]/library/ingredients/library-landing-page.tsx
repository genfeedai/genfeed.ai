'use client';

import { cn } from '@helpers/formatting/cn/cn.util';
import LibraryLandingCreditNotice from '@pages/library/landing/library-landing-credit-notice';
import CardIcon from '@ui/card/icon/CardIcon';
import Container from '@ui/layout/container/Container';
import { PageSection } from '@ui/layout/page-section';
import Link from 'next/link';
import { Suspense } from 'react';
import type { IconType } from 'react-icons';
import {
  HiOutlineArrowRight,
  HiOutlineFolder,
  HiOutlineMicrophone,
  HiOutlineMusicalNote,
  HiOutlinePhoto,
  HiOutlinePlayCircle,
  HiOutlineSparkles,
  HiOutlineVideoCamera,
} from 'react-icons/hi2';

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
    href: '/library/videos',
    icon: HiOutlineVideoCamera,
    id: 'videos',
    kicker: 'Motion',
    label: 'Videos',
    toneClassName: 'bg-amber-500/12 text-amber-300',
  },
  {
    description: 'Stills, references, and brand visual building blocks.',
    href: '/library/images',
    icon: HiOutlinePhoto,
    id: 'images',
    kicker: 'Still',
    label: 'Images',
    toneClassName: 'bg-sky-500/12 text-sky-300',
  },
  {
    description: 'Short-form loops and reaction-ready motion snippets.',
    href: '/library/gifs',
    icon: HiOutlinePlayCircle,
    id: 'gifs',
    kicker: 'Loop',
    label: 'GIFs',
    toneClassName: 'bg-emerald-500/12 text-emerald-300',
  },
  {
    description: 'Character presets and presenter surfaces for video creation.',
    href: '/library/avatars',
    icon: HiOutlineSparkles,
    id: 'avatars',
    kicker: 'Persona',
    label: 'Avatars',
    toneClassName: 'bg-fuchsia-500/12 text-fuchsia-300',
  },
];

const UTILITY_CATEGORY_CARDS: LibraryCategoryCardConfig[] = [
  {
    description: 'Voice presets and cloned speakers ready for narration.',
    href: '/library/voices',
    icon: HiOutlineMicrophone,
    id: 'voices',
    kicker: 'Voice',
    label: 'Voices',
    toneClassName: 'bg-white/[0.05] text-white/80',
  },
  {
    description: 'Music cues and background tracks organized for reuse.',
    href: '/library/music',
    icon: HiOutlineMusicalNote,
    id: 'music',
    kicker: 'Audio',
    label: 'Music',
    toneClassName: 'bg-white/[0.05] text-white/80',
  },
  {
    description:
      'Captions and copy-ready text assets for publishing workflows.',
    href: '/library/captions',
    icon: HiOutlineFolder,
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
  const Icon = config.icon;
  const titleId = `${config.id}-library-tile-title`;
  const descriptionId = `${config.id}-library-tile-description`;

  return (
    <Link
      href={config.href}
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      data-testid={testId}
      className={cn(
        'group block h-full rounded border border-white/[0.08] bg-card text-card-foreground shadow-[0_24px_60px_-40px_rgba(0,0,0,0.8)] transition-[border-color,background-color,box-shadow,transform] duration-200 ease-out',
        'hover:-translate-y-0.5 hover:border-white/[0.16] hover:bg-white/[0.02] hover:shadow-[0_28px_70px_-44px_rgba(0,0,0,0.9)]',
        'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
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
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-foreground/40">
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
          <HiOutlineArrowRight
            aria-hidden="true"
            className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1"
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

export default function LibraryLandingPage() {
  return (
    <Container
      label="Library"
      description="Browse reusable assets across your workspace."
      icon={HiOutlineFolder}
    >
      <div data-testid="library-landing-title" className="sr-only">
        Library
      </div>

      <div data-testid="library-landing" className="space-y-8">
        <div className="opacity-80">
          <Suspense fallback={null}>
            <LibraryLandingCreditNotice />
          </Suspense>
        </div>

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
