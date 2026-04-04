import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type StreakDocument = Streak & Document;

@Schema({ _id: false })
export class StreakMilestoneHistoryItem {
  @Prop({ required: true, type: Number })
  milestone!: number;

  @Prop({ required: true, type: Date })
  achievedAt!: Date;

  @Prop({ required: true, type: String })
  reward!: string;
}

const StreakMilestoneHistoryItemSchema = SchemaFactory.createForClass(
  StreakMilestoneHistoryItem,
);

@Schema({
  collection: 'streaks',
  timestamps: true,
  versionKey: false,
})
export class Streak {
  _id!: string;

  @Prop({ ref: 'User', required: true, type: Types.ObjectId })
  user!: Types.ObjectId;

  @Prop({ ref: 'Organization', required: true, type: Types.ObjectId })
  organization!: Types.ObjectId;

  @Prop({ default: 0, min: 0, type: Number })
  currentStreak!: number;

  @Prop({ default: 0, min: 0, type: Number })
  longestStreak!: number;

  @Prop({ default: null, type: Date })
  lastActivityDate?: Date | null;

  @Prop({ default: null, type: Date })
  streakStartDate?: Date | null;

  @Prop({ default: null, type: Date })
  lastBrokenAt?: Date | null;

  @Prop({ default: null, type: Number })
  lastBrokenStreak?: number | null;

  @Prop({ default: null, type: Date })
  lastFreezeUsedAt?: Date | null;

  @Prop({ default: 0, min: 0, type: Number })
  streakFreezes!: number;

  @Prop({ default: 0, min: 0, type: Number })
  totalContentDays!: number;

  @Prop({ default: [], type: [Number] })
  milestones!: number[];

  @Prop({ default: [], type: [StreakMilestoneHistoryItemSchema] })
  milestoneHistory!: StreakMilestoneHistoryItem[];

  @Prop({ default: false, type: Boolean })
  isDeleted!: boolean;
}

export const StreakSchema = SchemaFactory.createForClass(Streak);
