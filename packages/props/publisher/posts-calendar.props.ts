import type { Post } from '@models/content/post.model';
import type { CalendarItem } from '@props/components/calendar.props';
import type { ContentProps } from '@props/layout/content.props';

export interface PostsCalendarPageProps extends ContentProps {
  provider?: string;
}

export interface PostCalendarItem extends CalendarItem {
  post: Post;
}
