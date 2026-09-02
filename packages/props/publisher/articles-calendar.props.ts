import type { IArticle } from '@genfeedai/contracts/interfaces';
import type { CalendarItem } from '@props/components/calendar.props';

export interface ArticleCalendarItem extends CalendarItem {
  article: IArticle;
}
