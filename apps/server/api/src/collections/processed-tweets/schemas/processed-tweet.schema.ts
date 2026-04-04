import { ReplyBotType } from '@genfeedai/enums';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { type Document, Types } from 'mongoose';

export type ProcessedTweetDocument = ProcessedTweet & Document;

/**
 * Processed Tweet Schema
 *
 * Tracks which tweets have already been processed by the reply bot system
 * to prevent duplicate actions. Uses a TTL index to automatically expire
 * records after 7 days.
 */
@Schema({
  collection: 'processed-tweets',
  timestamps: true,
  versionKey: false,
})
export class ProcessedTweet {
  @Prop({
    index: true,
    ref: 'Organization',
    required: true,
    type: Types.ObjectId,
  })
  organization!: Types.ObjectId;

  @Prop({ index: true, required: true, type: String })
  tweetId!: string;

  @Prop({
    enum: Object.values(ReplyBotType),
    index: true,
    required: true,
    type: String,
  })
  processedBy!: ReplyBotType;

  @Prop({ index: true, ref: 'ReplyBotConfig', type: Types.ObjectId })
  replyBotConfig?: Types.ObjectId;

  @Prop({ ref: 'BotActivity', type: Types.ObjectId })
  botActivity?: Types.ObjectId;

  @Prop({
    default: Date.now,
    expires: 604800, // TTL: 7 days in seconds
    type: Date,
  })
  processedAt!: Date;
}

export const ProcessedTweetSchema =
  SchemaFactory.createForClass(ProcessedTweet);

// Compound unique index to prevent duplicate processing
ProcessedTweetSchema.index(
  { organization: 1, processedBy: 1, tweetId: 1 },
  { unique: true },
);
