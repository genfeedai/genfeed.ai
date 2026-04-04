import type {
  AvatarProvider,
  PersonaContentFormat,
  PersonaStatus,
  VoiceProvider,
} from '@genfeedai/enums';
import type {
  IBaseEntity,
  IBrand,
  ICredential,
  IIngredient,
  IOrganization,
  ITag,
  IUser,
} from '../index';

export interface IPersonaContentStrategy {
  topics?: string[];
  tone?: string;
  formats?: PersonaContentFormat[];
  frequency?: string;
  platforms?: string[];
}

export interface IPersona extends IBaseEntity {
  user: IUser;
  organization: IOrganization;
  brand: IBrand;
  label: string;
  handle?: string;
  bio?: string;
  profileImageUrl?: string;
  avatar?: IIngredient;
  avatarProvider?: AvatarProvider;
  avatarExternalId?: string;
  voice?: string;
  voiceProvider?: VoiceProvider;
  voiceExternalId?: string;
  contentStrategy?: IPersonaContentStrategy;
  credentials?: ICredential[];
  assignedMembers?: IUser[];
  status: PersonaStatus;
  tags?: ITag[];
}
