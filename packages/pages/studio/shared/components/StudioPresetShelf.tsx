'use client';

import { ButtonVariant } from '@genfeedai/contracts';
import type { StudioPresetShelfProps } from '@genfeedai/props/studio/studio-presets.props';
import CollectionSection from '@ui/collection/CollectionSection';
import { Button } from '@ui/primitives/button';
import { type ReactElement, useState } from 'react';

const DEFAULT_COLLAPSED_COUNT = 4;

/** Presets for returning users: one scrolling row that expands to the grid. */
export default function StudioPresetShelf<TPreset>({
  collapsedCount = DEFAULT_COLLAPSED_COUNT,
  presets,
  renderPresets,
  seeAllLabel,
  showFewerLabel,
  title,
}: StudioPresetShelfProps<TPreset>): ReactElement {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <CollectionSection
      actions={
        <Button
          aria-expanded={isExpanded}
          label={isExpanded ? showFewerLabel : seeAllLabel}
          onClick={() => setIsExpanded((current) => !current)}
          variant={ButtonVariant.GHOST}
        />
      }
      itemCount={presets.length}
      title={title}
    >
      {renderPresets(
        isExpanded ? presets : presets.slice(0, collapsedCount),
        isExpanded ? 'grid' : 'row',
      )}
    </CollectionSection>
  );
}
