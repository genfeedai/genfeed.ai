/** Emitted after a recording transaction commits (#5197). */
export const ACTIVITY_RECORDED_EVENT = 'activity.recorded';

export interface RecordedActivitySummary {
  id: string;
  key: string | null;
  organizationId: string | null;
  userId: string | null;
  createdAt: Date;
}

export interface ActivityRecordedEvent {
  activities: RecordedActivitySummary[];
}
