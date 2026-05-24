import type { AvatarProvider, VoiceProvider } from '@genfeedai/enums';
import type { Persona as PrismaPersona } from '@genfeedai/prisma';

export interface PersonaDocument extends PrismaPersona {
  _id: string;
  avatarExternalId?: string | null;
  avatarProvider?: AvatarProvider | string | null;
  brand?: string | null;
  triggerWord?: string | null;
  darkroomSources?: Array<Record<string, unknown>>;
  organization?: string;
  user?: string;
  voiceExternalId?: string | null;
  voiceProvider?: VoiceProvider | string | null;
  [key: string]: unknown;
}

export type Persona = PersonaDocument;
