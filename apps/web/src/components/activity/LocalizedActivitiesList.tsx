'use client';

import ActivitiesList from '@/features/activities/activities-list';
import type { ActivitiesListProps } from '@/features/activities/props/activities.props';
import { useActivityMessageFormatter } from '@/hooks/i18n/useActivityMessageFormatter';

export default function LocalizedActivitiesList(props: ActivitiesListProps) {
  const activityMessageFormatter = useActivityMessageFormatter();

  return (
    <ActivitiesList
      {...props}
      activityMessageFormatter={activityMessageFormatter}
    />
  );
}
