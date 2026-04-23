import { BaseEntity } from '@api/shared/entities/base/base.entity';
import type {
  AvatarProvider,
  PersonaStatus,
  VoiceProvider,
} from '@genfeedai/enums';

export class PersonaEntity extends BaseEntity {
  declare readonly user: string;
  declare readonly organization: string;
  declare readonly brand: string;
  declare readonly label: string;
  declare readonly handle?: string;
  declare readonly bio?: string;
  declare readonly profileImageUrl?: string;
  declare readonly avatar?: string;
  declare readonly avatarProvider?: AvatarProvider;
  declare readonly avatarExternalId?: string;
  declare readonly voice?: string;
  declare readonly voiceProvider?: VoiceProvider;
  declare readonly voiceExternalId?: string;
  declare readonly contentStrategy?: Record<string, unknown> | null;
  declare readonly credentials?: string[];
  declare readonly assignedMembers?: string[];
  declare readonly status: PersonaStatus;
  declare readonly tags?: string[];
}
