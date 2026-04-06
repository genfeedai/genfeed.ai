import { AssetEntity } from '@api/collections/assets/entities/asset.entity';
import { OrganizationSettingEntity } from '@api/collections/organization-settings/entities/organization-setting.entity';
import { OrganizationCategory } from '@genfeedai/enums';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { type Document, Types } from 'mongoose';

export type OrganizationDocument = Organization & Document;

@Schema({
  collation: { locale: 'en', strength: 1 },
  collection: 'organizations',
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
  versionKey: false,
})
export class Organization {
  _id!: string;

  @Prop({
    ref: 'User',
    required: true,
    type: Types.ObjectId,
  })
  user!: Types.ObjectId;

  @Prop({ required: true, type: String })
  label!: string;

  @Prop({
    index: true,
    lowercase: true,
    match: /^[a-z0-9][a-z0-9-]*[a-z0-9]$/,
    maxlength: 48,
    minlength: 2,
    required: false,
    trim: true,
    type: String,
    unique: true,
  })
  slug?: string;

  @Prop({
    match: /^[A-Z]{3}$/,
    maxlength: 3,
    minlength: 3,
    required: false,
    type: String,
    uppercase: true,
  })
  prefix?: string;

  @Prop({ default: false, type: Boolean })
  isSelected!: boolean;

  @Prop({ default: false, type: Boolean, index: true })
  isDefault!: boolean;

  @Prop({ default: false, type: Boolean })
  isDeleted!: boolean;

  @Prop({
    default: OrganizationCategory.BUSINESS,
    enum: OrganizationCategory,
    index: true,
    type: String,
  })
  category!: OrganizationCategory;

  @Prop({
    enum: OrganizationCategory,
    index: true,
    required: false,
    type: String,
  })
  accountType?: OrganizationCategory;

  @Prop({ default: false, type: Boolean })
  onboardingCompleted!: boolean;

  @Prop({ default: false, type: Boolean })
  isProactiveOnboarding!: boolean;

  @Prop({ default: false, type: Boolean })
  proactiveWelcomeDismissed!: boolean;

  // Virtual fields
  logo?: AssetEntity | Types.ObjectId;
  banner?: AssetEntity | Types.ObjectId;
  settings?: OrganizationSettingEntity | Types.ObjectId;
}

export const OrganizationSchema = SchemaFactory.createForClass(Organization);
