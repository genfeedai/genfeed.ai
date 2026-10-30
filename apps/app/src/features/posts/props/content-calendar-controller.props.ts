import type {
  IArticle,
  ICalendarSlot,
  ICredential,
  IPostingCadence,
  IReleaseGroup,
} from '@genfeedai/contracts/interfaces';
import type { Newsletter } from '@models/content/newsletter.model';
import type { CalendarViewKey } from '@props/components/calendar.props';
import type { GlobalModalsContextValue } from '@props/modals/global-modals.props';
import type { ReleaseCalendarFilters } from '@props/publisher/release-calendar.props';
import type { ArticlesService } from '@services/content/articles.service';
import type { NewslettersService } from '@services/content/newsletters.service';
import type { PostingCadencesService } from '@services/content/posting-cadences.service';
import type { PostsService } from '@services/content/posts.service';
import type { ReleaseGroupsService } from '@services/content/release-groups.service';
import type { NotificationsService } from '@services/core/notifications.service';
import type { Dispatch, SetStateAction } from 'react';

export interface ContentCalendarPageProps {
  campaignId?: string;
  embedded?: boolean;
}
export interface ContentCalendarDateRange {
  start: Date;
  end: Date;
}
export type ContentCalendarTranslate = (
  key: string,
  values?: Record<string, string | number>,
) => string;
export interface ContentCalendarItemsOptions {
  articles: IArticle[];
  newsletters: Newsletter[];
  releases: IReleaseGroup[];
  slots: ICalendarSlot[];
  globalFilterQuery: string;
  calendarView: CalendarViewKey;
  translate: ContentCalendarTranslate;
}
export interface ContentCalendarLoadOptions {
  brandId: string;
  campaignId?: string;
  dateRange: ContentCalendarDateRange | null;
  filters: ReleaseCalendarFilters;
  getArticlesService: () => Promise<Pick<ArticlesService, 'findAll'>>;
  getNewslettersService: () => Promise<
    Pick<NewslettersService, 'findAllPages'>
  >;
  getPostingCadencesService: () => Promise<
    Pick<PostingCadencesService, 'list' | 'listSlots'>
  >;
  getReleaseGroupsService: () => Promise<
    Pick<ReleaseGroupsService, 'findAllPages'>
  >;
  notificationsService: Pick<NotificationsService, 'error'>;
}
export interface CalendarReleaseActionsOptions {
  releases: IReleaseGroup[];
  setReleases: Dispatch<SetStateAction<IReleaseGroup[]>>;
  getReleaseGroupsService: () => Promise<ReleaseGroupsService>;
  getPostsService: () => Promise<PostsService>;
  notificationsService: NotificationsService;
  openPostRepurposeModal: GlobalModalsContextValue['openPostRepurposeModal'];
  push: (href: string) => void;
  href: (path: string) => string;
}
export interface CalendarSlotActionsOptions {
  brandId: string;
  defaultCredentialId: string;
  dateRange: ContentCalendarDateRange | null;
  cadences: IPostingCadence[];
  setCadences: Dispatch<SetStateAction<IPostingCadence[]>>;
  setSlots: Dispatch<SetStateAction<ICalendarSlot[]>>;
  selectedSlot: ICalendarSlot | null;
  setSelectedSlot: Dispatch<SetStateAction<ICalendarSlot | null>>;
  setSelectedReleaseId: Dispatch<SetStateAction<string | null>>;
  getPostingCadencesService: () => Promise<PostingCadencesService>;
  notificationsService: NotificationsService;
  push: (href: string) => void;
  href: (path: string) => string;
}
export interface CalendarBulkGenerationOptions {
  getPostingCadencesService: () => Promise<
    Pick<PostingCadencesService, 'generateBulk'>
  >;
  setSlots: Dispatch<SetStateAction<ICalendarSlot[]>>;
  setSelectedSlot: Dispatch<SetStateAction<ICalendarSlot | null>>;
  notificationsService: Pick<NotificationsService, 'error' | 'success'>;
  openConfirm: GlobalModalsContextValue['openConfirm'];
  translate: ContentCalendarTranslate;
}

export interface CalendarEventPresentationOptions {
  translate: ContentCalendarTranslate;
  generateSlotByIdentity: (
    identityKey: string,
    brief?: string,
  ) => Promise<void>;
}
export interface CalendarChannelOptionsInput {
  credentials: ICredential[];
  credentialIds: string[];
}
