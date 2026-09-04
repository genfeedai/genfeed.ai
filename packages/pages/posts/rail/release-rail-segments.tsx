'use client';

import type { ReleaseRailSegmentsProps } from '@props/publisher/release-rail.props';
import Tabs from '@ui/navigation/tabs/Tabs';
import { Badge } from '@ui/primitives/badge';
import { useTranslations } from 'next-intl';
import { RELEASE_RAIL_SEGMENTS } from './release-rail-segments.helpers';

export default function ReleaseRailSegments({
  counts,
  onSegmentChange,
  segment,
}: ReleaseRailSegmentsProps) {
  const translate = useTranslations('pages.posts.list.rail');

  return (
    <Tabs
      activeTab={segment}
      fullWidth={false}
      items={RELEASE_RAIL_SEGMENTS.map((option) => {
        const count = counts?.[option];
        return {
          badge:
            typeof count === 'number' ? (
              <Badge variant="outline">{count}</Badge>
            ) : undefined,
          id: option,
          label: translate(`segments.${option}`),
        };
      })}
      onTabChange={(value) =>
        onSegmentChange(value as (typeof RELEASE_RAIL_SEGMENTS)[number])
      }
    />
  );
}
