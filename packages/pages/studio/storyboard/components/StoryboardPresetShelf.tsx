'use client';

import { ButtonVariant } from '@genfeedai/contracts';
import StoryboardPresetGrid from '@pages/studio/storyboard/components/StoryboardPresetGrid';
import { STORYBOARD_PRESETS } from '@pages/studio/storyboard/data/storyboard-presets';
import CollectionSection from '@ui/collection/CollectionSection';
import { Button } from '@ui/primitives/button';
import { useTranslations } from 'next-intl';
import { type ReactElement, useState } from 'react';

const COLLAPSED_PRESET_COUNT = 4;

/** Presets for returning users: one scrolling row that expands to the full grid. */
export default function StoryboardPresetShelf(): ReactElement {
  const translate = useTranslations('pages.studioStoryboard.presets');
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <CollectionSection
      actions={
        <Button
          aria-expanded={isExpanded}
          label={translate(isExpanded ? 'showFewer' : 'seeAll')}
          onClick={() => setIsExpanded((current) => !current)}
          variant={ButtonVariant.GHOST}
        />
      }
      itemCount={STORYBOARD_PRESETS.length}
      title={translate('shelfTitle')}
    >
      <StoryboardPresetGrid
        layout={isExpanded ? 'grid' : 'row'}
        presets={
          isExpanded
            ? STORYBOARD_PRESETS
            : STORYBOARD_PRESETS.slice(0, COLLAPSED_PRESET_COUNT)
        }
      />
    </CollectionSection>
  );
}
