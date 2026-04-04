import { VoteEntityModel } from '@genfeedai/enums';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { type Document, Types } from 'mongoose';

@Schema({
  collation: { locale: 'en', strength: 1 },
  collection: 'votes',
  timestamps: true,
  versionKey: false,
})
export class Vote {
  _id!: string;

  @Prop({
    ref: 'User',
    required: true,
    type: Types.ObjectId,
  })
  user!: Types.ObjectId;

  @Prop({
    refPath: 'entityModel',
    required: true,
    type: Types.ObjectId,
  })
  entity!: Types.ObjectId;

  @Prop({
    enum: Object.values(VoteEntityModel),
    required: true,
    type: String,
  })
  entityModel!: VoteEntityModel;

  @Prop({ default: false, type: Boolean })
  isDeleted!: boolean;
}

export const VoteSchema = SchemaFactory.createForClass(Vote);

export type VoteDocument = Vote & Document;
