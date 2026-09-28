'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import CollectionList from '@ui/collection/CollectionList';
import CollectionSection from '@ui/collection/CollectionSection';
import { ListRow } from '@ui/lists/list-row/ListRow';
import { Button } from '@ui/primitives/button';
import { useMemo } from 'react';

export interface CampaignNeedsYouProps {
  title: string;
  /** The campaign is paused and someone needs to decide whether to resume it. */
  isPaused: boolean;
  pausedDescription: string;
  resumeLabel: string;
  onResume?: () => void;
  className?: string;
}

/**
 * The campaign's own open work. Reuses the campaign already loaded for the
 * page — no new query (#5483 non-goal: new data). Shared by the agent
 * Program and outreach campaign detail pages, which share the same
 * paused/running/completed lifecycle.
 */
export default function CampaignNeedsYou({
  title,
  isPaused,
  pausedDescription,
  resumeLabel,
  onResume,
  className,
}: CampaignNeedsYouProps) {
  const items = useMemo(
    () => (isPaused && onResume ? [{ id: 'paused' }] : []),
    [isPaused, onResume],
  );

  return (
    <CollectionSection
      className={className}
      itemCount={items.length}
      title={title}
    >
      <CollectionList>
        {items.map((item) => (
          <ListRow
            key={item.id}
            title={pausedDescription}
            trailing={
              <Button
                label={resumeLabel}
                onClick={onResume}
                size={ButtonSize.SM}
                variant={ButtonVariant.SECONDARY}
              />
            }
          />
        ))}
      </CollectionList>
    </CollectionSection>
  );
}
