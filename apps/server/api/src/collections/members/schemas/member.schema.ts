import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { type Document, Types } from 'mongoose';

export type MemberDocument = Member & Document;

@Schema({
  collation: { locale: 'en', strength: 1 },
  collection: 'members',
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
  versionKey: false,
})
export class Member {
  _id!: string;

  @Prop({
    ref: 'Organization',
    required: true,
    type: Types.ObjectId,
  })
  organization!: Types.ObjectId;

  @Prop({
    ref: 'User',
    required: true,
    type: Types.ObjectId,
  })
  user!: Types.ObjectId;

  @Prop({
    ref: 'Role',
    required: true,
    type: Types.ObjectId,
  })
  role!: Types.ObjectId;

  @Prop({
    default: [],
    type: [{ ref: 'Brand', type: Types.ObjectId }],
  })
  brands!: Types.ObjectId[];

  @Prop({
    default: null,
    ref: 'Brand',
    type: Types.ObjectId,
  })
  lastUsedBrand!: Types.ObjectId | null;

  @Prop({ default: true, type: Boolean })
  // Indicates if the member's seat is active for billing
  isActive!: boolean;

  @Prop({ default: false, type: Boolean })
  isDeleted!: boolean;
}

export const MemberSchema = SchemaFactory.createForClass(Member);
