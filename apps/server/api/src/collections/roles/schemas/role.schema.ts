import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { Document } from 'mongoose';

export type RoleDocument = Role & Document;

@Schema({
  collation: { locale: 'en', strength: 1 },
  collection: 'roles',
  timestamps: true,
  versionKey: false,
})
export class Role {
  _id!: string;

  @Prop({
    required: true,
    type: String,
  })
  label!: string;

  @Prop({
    required: true,
    type: String,
    unique: true,
  })
  key!: string;

  @Prop({ required: false, type: String })
  primaryColor?: string;

  @Prop({ default: false, type: Boolean })
  isDeleted!: boolean;
}

export const RoleSchema = SchemaFactory.createForClass(Role);
