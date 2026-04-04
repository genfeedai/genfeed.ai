import {
  Ingredient,
  type IngredientDocument,
} from '@api/collections/ingredients/schemas/ingredient.schema';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

@Schema({
  collation: { locale: 'en', strength: 1 },
  collection: 'videos',
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
  versionKey: false,
})
export class Video extends Ingredient {
  @Prop({ default: 'en', type: String })
  language!: string;

  @Prop({ required: false, type: String })
  promptTemplate?: string;

  @Prop({ required: false, type: Number })
  templateVersion?: number;
}

export interface VideoDocument extends IngredientDocument {
  language: string;
  promptTemplate?: string;
  templateVersion?: number;
}

export const VideoSchema = SchemaFactory.createForClass(Video);
