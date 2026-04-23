import type { Announcement } from '@api/collections/announcements/schemas/announcement.schema';
import { BaseEntity } from '@api/shared/entities/base/base.entity';

export class AnnouncementEntity extends BaseEntity implements Announcement {
  id!: string;
  mongoId!: string | null;
  organizationId!: string;
  title!: string | null;
  content!: string | null;
  config!: Announcement['config'];

  body!: string;
  tweetText?: string;
  channels!: string[];
  discordChannelId?: string;
  discordMessageUrl?: string;
  tweetId?: string;
  tweetUrl?: string;
  authorId!: string;
  publishedAt?: Date;
  isDeleted!: boolean;
}
