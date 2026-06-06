import { ButtonVariant } from '@genfeedai/enums';
import { Button } from '@ui/primitives/button';
import type { ReactElement } from 'react';

const PLATFORM_FILTERS = [
  { label: 'All', value: '' },
  { label: 'TikTok', value: 'tiktok' },
  { label: 'Twitter', value: 'twitter' },
  { label: 'Instagram', value: 'instagram' },
  { label: 'LinkedIn', value: 'linkedin' },
] as const;

type SortBy = 'date' | 'votes';

type LibraryFiltersBarProps = {
  platformFilter: string;
  sortBy: SortBy;
  onPlatformChange: (value: string) => void;
  onSortChange: (value: SortBy) => void;
};

export function LibraryFiltersBar({
  platformFilter,
  sortBy,
  onPlatformChange,
  onSortChange,
}: LibraryFiltersBarProps): ReactElement {
  return (
    <div className="library-filters">
      <div className="pill-group">
        {PLATFORM_FILTERS.map((pf) => (
          <Button
            className={`pill-button ${platformFilter === pf.value ? 'pill-active' : ''}`}
            key={pf.value}
            onClick={() => onPlatformChange(pf.value)}
            type="button"
            variant={ButtonVariant.UNSTYLED}
          >
            {pf.label}
          </Button>
        ))}
      </div>
      <div className="pill-group">
        <Button
          className={`pill-button ${sortBy === 'votes' ? 'pill-active' : ''}`}
          onClick={() => onSortChange('votes')}
          type="button"
          variant={ButtonVariant.UNSTYLED}
        >
          By Votes
        </Button>
        <Button
          className={`pill-button ${sortBy === 'date' ? 'pill-active' : ''}`}
          onClick={() => onSortChange('date')}
          type="button"
          variant={ButtonVariant.UNSTYLED}
        >
          By Date
        </Button>
      </div>
    </div>
  );
}
