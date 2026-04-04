import { CreditTransactionCategory } from '@genfeedai/enums';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { type Document, Types } from 'mongoose';

export type CreditTransactionsDocument = CreditTransactions & Document;

@Schema({
  collation: { locale: 'en', strength: 1 },
  collection: 'credit-transactions',
  timestamps: true,
  versionKey: false,
})
export class CreditTransactions {
  _id!: string;

  @Prop({
    ref: 'Organization',
    required: true,
    type: Types.ObjectId,
  })
  organization!: Types.ObjectId;

  @Prop({
    enum: Object.values(CreditTransactionCategory),
    required: true,
    type: String,
  })
  category!: CreditTransactionCategory;

  @Prop({ required: true, type: Number })
  amount!: number;

  @Prop({ required: true, type: Number })
  balanceBefore!: number;

  @Prop({ required: true, type: Number })
  balanceAfter!: number;

  @Prop({ type: String })
  source?: string;

  @Prop({ type: String })
  description?: string;

  @Prop({ type: Date })
  expiresAt?: Date;

  @Prop({ default: false, type: Boolean })
  isDeleted!: boolean;
}

export const CreditTransactionsSchema =
  SchemaFactory.createForClass(CreditTransactions);
