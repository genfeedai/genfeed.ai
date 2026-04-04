import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { type Document, Types } from 'mongoose';

export type ProfileDocument = Profile & Document;

export interface IImageProfile {
  style: string; // 'modern', 'vintage', 'minimalist'
  mood: string[]; // ['professional', 'energetic', 'calm']
  colorPalette: {
    primary: string[];
    secondary: string[];
    neutral: string[];
    avoid?: string[];
  };
  lighting?: string; // 'dramatic', 'soft', 'natural'
  composition?: string[]; // ['rule-of-thirds', 'symmetrical', 'dynamic']
}

export interface IVideoProfile {
  pacing: string; // 'fast', 'medium', 'slow'
  energy: string; // 'high', 'medium', 'low'
  transitions: string[]; // ['cut', 'fade', 'zoom']
  musicStyle?: string[]; // ['electronic', 'acoustic', 'upbeat']
  colorGrading?: string; // 'vibrant', 'muted', 'cinematic'
  aspectRatio?: string[]; // ['16:9', '9:16', '1:1']
}

export interface IVoiceProfile {
  personality: string; // 'enthusiastic', 'professional', 'friendly'
  pace: string; // 'fast', 'medium', 'slow'
  emotion: string[]; // ['excited', 'confident', 'calm']
  speakingStyle: string; // 'conversational', 'formal', 'storytelling'
  pitch?: string; // 'high', 'medium', 'low'
}

export interface IArticleProfile {
  writingStyle: string; // 'conversational', 'academic', 'journalistic'
  formality: string; // 'formal', 'informal', 'semi-formal'
  vocabulary: string; // 'simple', 'moderate', 'advanced'
  readingLevel: string; // 'elementary', 'high-school', 'college'
  sentenceLength?: string; // 'short', 'medium', 'long', 'varied'
  paragraphStructure?: string; // 'short', 'medium', 'long'
}

@Schema({ collection: 'profiles', timestamps: true })
export class Profile {
  @Prop({
    ref: 'Organization',
    required: true,
    type: Types.ObjectId,
  })
  organization!: Types.ObjectId;

  @Prop({ ref: 'User', type: Types.ObjectId })
  createdBy?: Types.ObjectId;

  @Prop({ required: true, type: String })
  label!: string;

  @Prop({ required: true, type: String })
  description!: string;

  @Prop({ type: Object })
  image?: IImageProfile;

  @Prop({ type: Object })
  video?: IVideoProfile;

  @Prop({ type: Object })
  voice?: IVoiceProfile;

  @Prop({ type: Object })
  article?: IArticleProfile;

  @Prop({ default: [], type: Array })
  tags!: string[];

  @Prop({ default: false, type: Boolean })
  isDefault!: boolean; // Default profile for organization

  @Prop({ default: 0, type: Number })
  usageCount!: number;

  @Prop({ type: Object })
  metadata?: {
    brandGuidelines?: string;
    targetAudience?: string;
    exampleContent?: string[];
  };

  @Prop({ default: false, type: Boolean })
  isDeleted!: boolean;
}

export const ProfileSchema = SchemaFactory.createForClass(Profile);
