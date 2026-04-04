import type { BotPlatform, Scope } from '@genfeedai/enums';

export type CalendarEventStatus =
  | 'draft'
  | 'scheduled'
  | 'in-progress'
  | 'completed'
  | 'cancelled';

export type CalendarEventCategory =
  | 'stream'
  | 'post'
  | 'campaign'
  | 'collaboration'
  | 'automation';

export type CalendarEventScope = Scope.BRAND | Scope.ORGANIZATION;

export interface CalendarEventChecklistItem {
  id: string;
  label: string;
  isComplete: boolean;
}

export interface ICalendarEvent {
  id: string;
  title: string;
  summary: string;
  scope: CalendarEventScope;
  status: CalendarEventStatus;
  category: CalendarEventCategory;
  startAt: string;
  endAt: string;
  platforms: BotPlatform[];
  tags: string[];
  owner: {
    label: string;
    category: CalendarEventScope;
  };
  deliverablesPlanned: number;
  deliverablesReady: number;
  approvalsNeeded: number;
  priority: 'low' | 'medium' | 'high';
  lastUpdatedAt: string;
  checklist: CalendarEventChecklistItem[];
}
