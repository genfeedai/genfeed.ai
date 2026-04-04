import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { type Document } from 'mongoose';

export type AnnouncementDocument = Announcement & Document;

@Schema({ collection: 'announcements', timestamps: true })
export class Announcement {
  @Prop({ required: true, type: String })
  body!: string;

  @Prop({ required: false, type: String })
  tweetText?: string;

  @Prop({ default: [], required: true, type: [String] })
  channels!: string[];

  @Prop({ required: false, type: String })
  discordChannelId?: string;

  @Prop({ required: false, type: String })
  discordMessageUrl?: string;

  @Prop({ required: false, type: String })
  tweetId?: string;

  @Prop({ required: false, type: String })
  tweetUrl?: string;

  @Prop({ required: true, type: String })
  authorId!: string;

  @Prop({ required: false, type: Date })
  publishedAt?: Date;

  @Prop({ default: false, index: true })
  isDeleted!: boolean;
}

export const AnnouncementSchema = SchemaFactory.createForClass(Announcement);
