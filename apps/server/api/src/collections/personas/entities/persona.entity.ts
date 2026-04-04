import type { PersonaContentStrategy } from '@api/collections/personas/schemas/persona.schema';
import { BaseEntity } from '@api/shared/entities/base/base.entity';
import type {
  AvatarProvider,
  PersonaStatus,
  VoiceProvider,
} from '@genfeedai/enums';
import type { Types } from 'mongoose';

export class PersonaEntity extends BaseEntity {
  declare readonly user: Types.ObjectId;
  declare readonly organization: Types.ObjectId;
  declare readonly brand: Types.ObjectId;
  declare readonly label: string;
  declare readonly handle?: string;
  declare readonly bio?: string;
  declare readonly profileImageUrl?: string;
  declare readonly avatar?: Types.ObjectId;
  declare readonly avatarProvider?: AvatarProvider;
  declare readonly avatarExternalId?: string;
  declare readonly voice?: Types.ObjectId;
  declare readonly voiceProvider?: VoiceProvider;
  declare readonly voiceExternalId?: string;
  declare readonly contentStrategy?: PersonaContentStrategy;
  declare readonly credentials?: Types.ObjectId[];
  declare readonly assignedMembers?: Types.ObjectId[];
  declare readonly status: PersonaStatus;
  declare readonly tags?: Types.ObjectId[];
}
