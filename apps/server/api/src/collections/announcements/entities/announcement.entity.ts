import type { Announcement } from '@api/collections/announcements/schemas/announcement.schema';
import { BaseEntity } from '@api/shared/entities/base/base.entity';

export class AnnouncementEntity extends BaseEntity implements Announcement {
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
