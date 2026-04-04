import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { type Document, Types } from 'mongoose';

export type CompanyDocument = Company & Document;

@Schema({
  collection: 'companies',
  timestamps: true,
  versionKey: false,
})
export class Company {
  @Prop({ required: true, type: String })
  name!: string;

  @Prop({ required: false, type: String })
  website?: string;

  @Prop({ required: false, type: String })
  domain?: string;

  @Prop({ required: false, type: String })
  industry?: string;

  @Prop({ required: false, type: String })
  size?: string;

  @Prop({ required: false, type: String })
  status?: string;

  @Prop({ required: false, type: String })
  billingType?: string;

  @Prop({ required: false, type: String })
  twitterHandle?: string;

  @Prop({ required: false, type: String })
  instagramHandle?: string;

  @Prop({ required: false, type: String })
  avatarUrl?: string;

  @Prop({ required: false, type: String })
  notes?: string;

  @Prop({
    ref: 'Organization',
    required: true,
    type: Types.ObjectId,
  })
  organization!: Types.ObjectId;

  @Prop({ default: false, type: Boolean })
  isDeleted!: boolean;

  createdAt!: Date;
  updatedAt!: Date;
}

export const CompanySchema = SchemaFactory.createForClass(Company);

CompanySchema.index(
  { isDeleted: 1, organization: 1 },
  { name: 'idx_org', partialFilterExpression: { isDeleted: false } },
);
