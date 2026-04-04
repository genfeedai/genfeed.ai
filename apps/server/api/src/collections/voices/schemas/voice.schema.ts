import {
  Ingredient,
  type IngredientDocument,
} from '@api/collections/ingredients/schemas/ingredient.schema';
import { VoiceCloneStatus, VoiceProvider } from '@genfeedai/enums';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { ApiProperty } from '@nestjs/swagger';

@Schema({
  collation: { locale: 'en', strength: 1 },
  collection: 'voices',
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
  versionKey: false,
})
export class Voice extends Ingredient {
  @ApiProperty({
    description: 'Canonical voice source classification for library queries.',
  })
  @Prop({
    default: 'generated',
    enum: ['catalog', 'cloned', 'generated'],
    type: String,
  })
  voiceSource?: 'catalog' | 'cloned' | 'generated';

  @ApiProperty({ description: 'Third-party provider for the voice.' })
  @Prop({
    default: VoiceProvider.HEYGEN,
    enum: Object.values(VoiceProvider),
    type: String,
  })
  provider!: VoiceProvider;

  @ApiProperty({
    description:
      'External voice ID from the provider (e.g. ElevenLabs voice_id or Genfeed handle).',
  })
  @Prop({ type: String })
  externalVoiceId?: string;

  @ApiProperty({ description: 'Status of the voice cloning process.' })
  @Prop({
    default: VoiceCloneStatus.PENDING,
    enum: Object.values(VoiceCloneStatus),
    type: String,
  })
  cloneStatus?: VoiceCloneStatus;

  @ApiProperty({ description: 'URL to sample audio for this voice.' })
  @Prop({ type: String })
  sampleAudioUrl?: string;

  @ApiProperty({ description: 'Whether this voice was created via cloning.' })
  @Prop({ default: false, type: Boolean })
  isCloned?: boolean;

  @ApiProperty({ description: 'Whether this voice is active in the library.' })
  @Prop({ default: true, index: true, type: Boolean })
  isActive?: boolean;

  @ApiProperty({
    description: 'Whether this voice can be selected as an org/brand default.',
  })
  @Prop({ default: true, type: Boolean })
  isDefaultSelectable?: boolean;

  @ApiProperty({
    description: 'Provider-specific metadata for seeded catalog voices.',
  })
  @Prop({ default: {}, type: Object })
  providerData?: Record<string, unknown>;

  @ApiProperty({
    description: 'Whether this voice should be highlighted in selection UIs.',
  })
  @Prop({ default: false, type: Boolean })
  isFeatured?: boolean;
}
export interface VoiceDocument extends IngredientDocument {
  voiceSource?: 'catalog' | 'cloned' | 'generated';
  provider: VoiceProvider;
  externalVoiceId?: string;
  cloneStatus?: VoiceCloneStatus;
  sampleAudioUrl?: string;
  isCloned?: boolean;
  isActive?: boolean;
  isDefaultSelectable?: boolean;
  providerData?: Record<string, unknown>;
  isFeatured?: boolean;
}

export const VoiceSchema = SchemaFactory.createForClass(Voice);
