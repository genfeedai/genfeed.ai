'use client';

import { ButtonVariant } from '@genfeedai/contracts';
import { Button } from '@ui/primitives/button';
import { useTranslations } from 'next-intl';
import type { StoryboardStarterCardsProps } from '@/features/studio/props/storyboard.props';

const VIDEO_STARTER_IDS = ['productTeaser', 'founderStory', 'howTo'] as const;
const SLIDESHOW_STARTER_IDS = ['tips', 'beforeAfter', 'mythBusting'] as const;

/**
 * Three example pitches for someone who has not written a brief yet. Picking
 * one only fills the composer, so they can reword it before the agent runs.
 */
export default function StoryboardStarterCards({
  isDisabled,
  isSlideshow,
  onSelect,
}: StoryboardStarterCardsProps) {
  const translate = useTranslations('pages.studioStoryboard.agentThread');
  const kind = isSlideshow ? 'slideshow' : 'video';
  const ids = isSlideshow ? SLIDESHOW_STARTER_IDS : VIDEO_STARTER_IDS;

  return (
    <section
      aria-label={translate('starters.title')}
      className="flex flex-col gap-2"
      data-testid="storyboard-starter-cards"
    >
      <h3 className="text-xs font-medium text-muted-foreground">
        {translate('starters.title')}
      </h3>
      {ids.map((id) => {
        const title = translate(`starters.${kind}.${id}.title`);
        const prompt = translate(`starters.${kind}.${id}.prompt`);

        return (
          <Button
            ariaLabel={translate('starters.apply', { title })}
            className={[
              'flex h-auto w-full flex-col items-start gap-1',
              'rounded-xl border border-border bg-background px-3.5 py-3',
              'text-left normal-case tracking-normal text-foreground/90',
              'transition-colors hover:border-border/80 hover:bg-card',
            ].join(' ')}
            data-testid={`storyboard-starter-${id}`}
            isDisabled={isDisabled}
            key={id}
            onClick={() => onSelect(prompt)}
            variant={ButtonVariant.UNSTYLED}
            withWrapper={false}
          >
            <span className="break-words text-left text-sm font-medium leading-snug text-foreground">
              {title}
            </span>
            <span className="line-clamp-3 break-words text-left text-xs leading-snug text-muted-foreground">
              {prompt}
            </span>
          </Button>
        );
      })}
    </section>
  );
}
