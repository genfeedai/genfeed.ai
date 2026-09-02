import type { AvatarProvider, VoiceProvider } from '@genfeedai/contracts';
import type { Persona as PrismaPersona } from '@genfeedai/prisma';

export interface PersonaDocument
  extends Omit<
    PrismaPersona,
    'avatarExternalId' | 'avatarProvider' | 'voiceExternalId' | 'voiceProvider'
  > {
  avatarExternalId?: string | null;
  avatarProvider?: AvatarProvider | string | null;
  bio?: string | null;
  contentStrategy?: Record<string, unknown> | null;
  emoji?: string | null;
  eyeColor?: string | null;
  triggerWord?: string | null;
  fleetSources?: Array<Record<string, unknown>>;
  loraStatus?: string | null;
  niche?: string | null;
  s3Folder?: string | null;
  skinTone?: string | null;
  voiceExternalId?: string | null;
  voiceProvider?: VoiceProvider | string | null;
  [key: string]: unknown;
}

export type Persona = PersonaDocument;
