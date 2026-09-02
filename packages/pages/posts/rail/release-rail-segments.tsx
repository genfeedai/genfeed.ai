'use client';

import type { ReleaseRailSegmentsProps } from '@props/publisher/release-rail.props';
import { Badge } from '@ui/primitives/badge';
import { ToggleGroup, ToggleGroupItem } from '@ui/primitives/toggle-group';
import { useTranslations } from 'next-intl';
import { RELEASE_RAIL_SEGMENTS } from './release-rail-segments.helpers';

export default function ReleaseRailSegments({
  counts,
  onSegmentChange,
  segment,
}: ReleaseRailSegmentsProps) {
  const translate = useTranslations('pages.posts.list.rail');

  return (
    <ToggleGroup
      onValueChange={(value) => {
        if (value) {
          onSegmentChange(value as (typeof RELEASE_RAIL_SEGMENTS)[number]);
        }
      }}
      size="sm"
      type="single"
      value={segment}
      variant="outline"
    >
      {RELEASE_RAIL_SEGMENTS.map((option) => {
        const count = counts?.[option];
        return (
          <ToggleGroupItem key={option} value={option}>
            <span className="flex items-center gap-1.5">
              {translate(`segments.${option}`)}
              {typeof count === 'number' ? (
                <Badge variant="outline">{count}</Badge>
              ) : null}
            </span>
          </ToggleGroupItem>
        );
      })}
    </ToggleGroup>
  );
}
