import {
  ActivityEntityModel,
  ActivityKey,
  ActivitySource,
} from '@genfeedai/enums';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { type Document, Types } from 'mongoose';

@Schema({
  collation: { locale: 'en', strength: 1 },
  collection: 'activities',
  timestamps: true,
  versionKey: false,
})
export class Activity {
  _id!: string;

  @Prop({
    ref: 'User',
    type: Types.ObjectId,
  })
  user!: Types.ObjectId;

  @Prop({
    ref: 'Organization',
    type: Types.ObjectId,
  })
  organization!: Types.ObjectId;

  @Prop({
    ref: 'Brand',
    type: Types.ObjectId,
  })
  brand!: Types.ObjectId;

  @Prop({
    enum: Object.values(ActivityKey),
    required: true,
    type: String,
  })
  key!: ActivityKey;

  @Prop({
    required: false,
    type: String,
  })
  value?: string;

  @Prop({
    enum: Object.values(ActivityEntityModel),
    required: false,
    type: String,
  })
  entityModel?: ActivityEntityModel;

  @Prop({
    required: false,
    type: Types.ObjectId,
  })
  entityId?: Types.ObjectId;

  @Prop({
    enum: Object.values(ActivitySource),
    required: true,
    type: String,
  })
  source!: ActivitySource;

  @Prop({ default: false, type: Boolean })
  isRead!: boolean;

  @Prop({ default: false, type: Boolean })
  isDeleted!: boolean;
}

export type ActivityDocument = Activity & Document;

export const ActivitySchema = SchemaFactory.createForClass(Activity);
