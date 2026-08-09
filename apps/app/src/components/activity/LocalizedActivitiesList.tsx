'use client';

import ActivitiesList from '@pages/activities/activities-list';
import type { ActivitiesListProps } from '@props/content/activities.props';
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
