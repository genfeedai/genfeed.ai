import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { type Document, Types } from 'mongoose';

export type CustomerDocument = Customer & Document;

@Schema({
  collation: { locale: 'en', strength: 1 },
  collection: 'customers',
  timestamps: true,
  versionKey: false,
})
export class Customer {
  _id!: string;

  @Prop({
    ref: 'Organization',
    required: true,
    type: Types.ObjectId,
  })
  organization!: Types.ObjectId;

  @Prop({ required: true, type: String })
  stripeCustomerId!: string;

  @Prop({ default: false, type: Boolean })
  isDeleted!: boolean;
}

export const CustomerSchema = SchemaFactory.createForClass(Customer);
