import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { type Document, Types } from 'mongoose';

export type CreditBalanceDocument = CreditBalance & Document;

@Schema({
  collation: { locale: 'en', strength: 1 },
  collection: 'credit-balances',
  timestamps: true,
  versionKey: false,
})
export class CreditBalance {
  _id!: string;

  @Prop({
    ref: 'Organization',
    required: true,
    type: Types.ObjectId,
    unique: true,
  })
  organization!: Types.ObjectId;

  @Prop({ default: 0, required: true, type: Number })
  balance!: number;

  @Prop({ type: Date })
  expiresAt?: Date;

  @Prop({ default: false, type: Boolean })
  isDeleted!: boolean;
}

export const CreditBalanceSchema = SchemaFactory.createForClass(CreditBalance);
