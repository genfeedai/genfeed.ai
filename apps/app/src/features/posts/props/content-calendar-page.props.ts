import type {
  IArticle,
  ICalendarSlot,
  IReleaseGroup,
} from '@genfeedai/contracts/interfaces';
import type { Newsletter } from '@models/content/newsletter.model';
import type { CalendarItem } from '@props/components/calendar.props';

export interface NewsletterContentCalendarItem extends CalendarItem {
  itemType: 'newsletter';
  newsletter: Newsletter;
}

export interface ArticleContentCalendarItem extends CalendarItem {
  article: IArticle;
  itemType: 'article';
}

export interface ReleaseContentCalendarItem extends CalendarItem {
  itemType: 'release';
  release: IReleaseGroup;
}

export interface SlotContentCalendarItem extends CalendarItem {
  itemType: 'slot';
  slot: ICalendarSlot;
}

export interface DayAggregateContentCalendarItem extends CalendarItem {
  filledCount: number;
  itemType: 'day-aggregate';
  missingCount: number;
  missingIdentityKeys: string[];
}

export type ContentCalendarItem =
  | NewsletterContentCalendarItem
  | ArticleContentCalendarItem
  | DayAggregateContentCalendarItem
  | ReleaseContentCalendarItem
  | SlotContentCalendarItem;
