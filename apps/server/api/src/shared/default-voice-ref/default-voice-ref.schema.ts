import { VoiceProvider } from '@genfeedai/enums';
import { Prop, Schema } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import {
  DEFAULT_VOICE_REF_SOURCES,
  type DefaultVoiceRefSource,
} from './default-voice-ref.constants';

@Schema({ _id: false })
export class DefaultVoiceRef {
  @Prop({
    enum: DEFAULT_VOICE_REF_SOURCES,
    required: true,
    type: String,
  })
  source!: DefaultVoiceRefSource;

  @Prop({
    enum: Object.values(VoiceProvider),
    required: true,
    type: String,
  })
  provider!: VoiceProvider;

  @Prop({
    ref: 'Ingredient',
    required: false,
    type: Types.ObjectId,
  })
  internalVoiceId?: Types.ObjectId;

  @Prop({ required: false, type: String })
  externalVoiceId?: string;

  @Prop({ required: false, type: String })
  label?: string;

  @Prop({ required: false, type: String })
  preview?: string | null;
}
