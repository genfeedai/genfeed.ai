import type { Setting } from '@api/collections/settings/schemas/setting.schema';
import { AppSource } from '@genfeedai/enums';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { Document } from 'mongoose';

export type UserDocument = User & Document;

@Schema({
  collation: { locale: 'en', strength: 1 },
  collection: 'users',
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
  versionKey: false,
})
export class User {
  _id!: string;

  @Prop({
    required: false,
    sparse: true,
    type: String,
    unique: true,
  })
  clerkId?: string;

  @Prop({
    required: true,
    type: String,
    unique: true,
  })
  handle!: string;

  @Prop({ required: false, type: String })
  firstName?: string;

  @Prop({ required: false, type: String })
  lastName?: string;

  @Prop({ required: false, type: String })
  email?: string;

  @Prop({ required: false, type: String })
  avatar?: string;

  @Prop({ default: false, type: Boolean, index: true })
  isDefault!: boolean;

  @Prop({ default: false, type: Boolean })
  isDeleted!: boolean;

  @Prop({ default: false, type: Boolean })
  isInvited?: boolean;

  @Prop({ default: false, type: Boolean })
  isOnboardingCompleted!: boolean;

  @Prop({ required: false, type: Date })
  onboardingStartedAt?: Date;

  @Prop({ required: false, type: Date })
  onboardingCompletedAt?: Date;

  @Prop({
    enum: ['creator', 'organization'],
    required: false,
    type: String,
  })
  onboardingType?: 'creator' | 'organization';

  @Prop({
    default: [],
    required: false,
    type: [String],
  })
  onboardingStepsCompleted!: string[];

  @Prop({
    default: AppSource.GENFEED,
    enum: Object.values(AppSource),
    index: true,
    type: String,
  })
  appSource!: AppSource;

  @Prop({ index: true, type: String })
  stripeCustomerId?: string;

  // Virtual field
  settings?: Setting;
}

export const UserSchema = SchemaFactory.createForClass(User);
