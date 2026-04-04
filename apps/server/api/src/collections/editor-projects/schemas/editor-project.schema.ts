import {
  EditorEffectType,
  EditorProjectStatus,
  EditorTrackType,
  EditorTransitionType,
  IngredientFormat,
} from '@genfeedai/enums';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { type Document, Types } from 'mongoose';

@Schema({ _id: false, versionKey: false })
export class EditorTextOverlay {
  @Prop({ required: true, type: String })
  text!: string;

  @Prop({ required: true, type: Object })
  position!: { x: number; y: number };

  @Prop({ required: true, type: Number })
  fontSize!: number;

  @Prop({ required: true, type: String })
  color!: string;

  @Prop({ required: false, type: String })
  fontFamily?: string;

  @Prop({ required: false, type: Number })
  fontWeight?: number;

  @Prop({ required: false, type: String })
  backgroundColor?: string;

  @Prop({ required: false, type: Number })
  padding?: number;
}

@Schema({ _id: false, versionKey: false })
export class EditorEffect {
  @Prop({ enum: EditorEffectType, required: true, type: String })
  type!: EditorEffectType;

  @Prop({ max: 100, min: 0, required: true, type: Number })
  intensity!: number;
}

@Schema({ _id: false, versionKey: false })
export class EditorTransition {
  @Prop({ enum: EditorTransitionType, required: true, type: String })
  type!: EditorTransitionType;

  @Prop({ min: 0, required: true, type: Number })
  duration!: number;
}

@Schema({ _id: false, versionKey: false })
export class EditorClip {
  @Prop({ required: true, type: String })
  id!: string;

  @Prop({ required: true, type: String })
  ingredientId!: string;

  @Prop({ required: true, type: String })
  ingredientUrl!: string;

  @Prop({ required: false, type: String })
  thumbnailUrl?: string;

  @Prop({ min: 0, required: true, type: Number })
  startFrame!: number;

  @Prop({ min: 1, required: true, type: Number })
  durationFrames!: number;

  @Prop({ min: 0, required: true, type: Number })
  sourceStartFrame!: number;

  @Prop({ min: 0, required: true, type: Number })
  sourceEndFrame!: number;

  @Prop({ default: [], type: [EditorEffect] })
  effects!: EditorEffect[];

  @Prop({ required: false, type: EditorTransition })
  transitionIn?: EditorTransition;

  @Prop({ required: false, type: EditorTransition })
  transitionOut?: EditorTransition;

  @Prop({ required: false, type: EditorTextOverlay })
  textOverlay?: EditorTextOverlay;

  @Prop({ max: 100, min: 0, required: false, type: Number })
  volume?: number;
}

@Schema({ _id: false, versionKey: false })
export class EditorTrack {
  @Prop({ required: true, type: String })
  id!: string;

  @Prop({ enum: EditorTrackType, required: true, type: String })
  type!: EditorTrackType;

  @Prop({ required: true, type: String })
  name!: string;

  @Prop({ default: [], type: [EditorClip] })
  clips!: EditorClip[];

  @Prop({ default: false, type: Boolean })
  isMuted!: boolean;

  @Prop({ default: false, type: Boolean })
  isLocked!: boolean;

  @Prop({ default: 100, max: 100, min: 0, type: Number })
  volume!: number;
}

@Schema({ _id: false, versionKey: false })
export class EditorProjectSettings {
  @Prop({
    default: IngredientFormat.LANDSCAPE,
    enum: IngredientFormat,
    type: String,
  })
  format!: IngredientFormat;

  @Prop({ default: 1920, type: Number })
  width!: number;

  @Prop({ default: 1080, type: Number })
  height!: number;

  @Prop({ default: 30, type: Number })
  fps!: number;

  @Prop({ default: '#000000', type: String })
  backgroundColor!: string;
}

@Schema({
  collation: { locale: 'en', strength: 1 },
  collection: 'editor-projects',
  timestamps: true,
  versionKey: false,
})
export class EditorProject {
  _id!: Types.ObjectId;

  @Prop({ default: 'Untitled Project', type: String })
  name!: string;

  @Prop({
    ref: 'Organization',
    required: true,
    type: Types.ObjectId,
  })
  organization!: Types.ObjectId;

  @Prop({
    ref: 'Brand',
    required: false,
    type: Types.ObjectId,
  })
  brand?: Types.ObjectId;

  @Prop({
    ref: 'User',
    required: true,
    type: Types.ObjectId,
  })
  user!: Types.ObjectId;

  @Prop({ default: [], type: [EditorTrack] })
  tracks!: EditorTrack[];

  @Prop({ default: () => ({}), type: EditorProjectSettings })
  settings!: EditorProjectSettings;

  @Prop({ default: 300, min: 1, type: Number })
  totalDurationFrames!: number;

  @Prop({
    default: EditorProjectStatus.DRAFT,
    enum: EditorProjectStatus,
    type: String,
  })
  status!: EditorProjectStatus;

  @Prop({
    ref: 'Ingredient',
    required: false,
    type: Types.ObjectId,
  })
  renderedVideo?: Types.ObjectId;

  @Prop({ required: false, type: String })
  thumbnailUrl?: string;

  @Prop({ default: false, type: Boolean })
  isDeleted!: boolean;
}

export type EditorProjectDocument = EditorProject & Document;

export const EditorProjectSchema = SchemaFactory.createForClass(EditorProject);
