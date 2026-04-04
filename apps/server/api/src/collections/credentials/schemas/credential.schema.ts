import { EncryptionUtil } from '@api/shared/utils/encryption/encryption.util';
import { CredentialPlatform } from '@genfeedai/enums';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { type Document, Types } from 'mongoose';

export type CredentialDocument = Credential & Document;

@Schema({
  collation: { locale: 'en', strength: 1 },
  collection: 'credentials',
  timestamps: true,
  toJSON: { getters: true, virtuals: true },
  toObject: { getters: true, virtuals: true },
  versionKey: false,
})
export class Credential {
  _id!: string;

  @Prop({ type: String })
  username?: string;

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
    ref: 'User',
    type: Types.ObjectId,
  })
  user!: Types.ObjectId;

  @Prop({
    default: [],
    ref: 'Tag',
    type: [Types.ObjectId],
  })
  tags!: Types.ObjectId[];

  @Prop({
    enum: Object.values(CredentialPlatform),
    required: true,
    type: String,
  })
  platform!: CredentialPlatform;

  @Prop({ required: false, type: String })
  externalId!: string;

  @Prop({ required: false, type: String })
  externalHandle!: string;

  @Prop({ required: false, type: String })
  externalName?: string;

  @Prop({ required: false, type: String })
  externalAvatar?: string;

  @Prop({ required: false, type: String })
  oauthState?: string;

  @Prop({
    get: (value: string) => (value ? EncryptionUtil.decrypt(value) : value),
    required: false,
    set: (value: string) => (value ? EncryptionUtil.encrypt(value) : value),
    type: String,
  })
  oauthToken!: string;

  @Prop({
    index: true,
    required: false,
    type: String,
  })
  oauthTokenHash?: string;

  @Prop({
    get: (value: string) => (value ? EncryptionUtil.decrypt(value) : value),
    required: false,
    set: (value: string) => (value ? EncryptionUtil.encrypt(value) : value),
    type: String,
  })
  oauthTokenSecret!: string;

  @Prop({
    get: (value: string) => (value ? EncryptionUtil.decrypt(value) : value),
    required: false,
    set: (value: string) => (value ? EncryptionUtil.encrypt(value) : value),
    type: String,
  })
  accessToken!: string;

  @Prop({
    get: (value: string) => (value ? EncryptionUtil.decrypt(value) : value),
    required: false,
    set: (value: string) => (value ? EncryptionUtil.encrypt(value) : value),
    type: String,
  })
  accessTokenSecret!: string;

  @Prop({ required: false, type: Date })
  accessTokenExpiry!: Date;

  @Prop({
    get: (value: string) => (value ? EncryptionUtil.decrypt(value) : value),
    required: false,
    set: (value: string) => (value ? EncryptionUtil.encrypt(value) : value),
    type: String,
  })
  refreshToken!: string;

  @Prop({ required: false, type: Date })
  refreshTokenExpiry!: Date;

  @Prop({ required: false, type: String })
  label!: string;

  @Prop({ required: false, type: String })
  description!: string;

  @Prop({ default: false, type: Boolean })
  isConnected!: boolean;

  @Prop({ default: false, type: Boolean })
  isDeleted!: boolean;
}

export const CredentialSchema = SchemaFactory.createForClass(Credential);
