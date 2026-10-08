import type { IBaseEntity } from '../index';

export interface HeyGenConnectionRef {
  provider: 'heygen';
  kind: 'byok' | 'platform';
  organizationId: string;
  credentialVersionId?: string;
}

export interface HeyGenAvatarReadiness {
  lookStatus: string | null;
  groupStatus: string | null;
  consentStatus: string | null;
  usable: boolean;
  reason: string | null;
}

/** Preview media is display-only; lookId is the renderable provider identity. */
export interface HeyGenAvatarRef {
  version: 1;
  source: 'heygen-look';
  provider: 'heygen';
  lookId: string;
  groupId: string | null;
  ownership: 'private' | 'public';
  label: string;
  preview: string | null;
  avatarType: string | null;
  supportedEngines: string[];
  readiness: HeyGenAvatarReadiness;
  connection: HeyGenConnectionRef;
}

export interface HeyGenCatalogAvatar {
  avatarId: string;
  name: string;
  preview: string;
  index: number;
  avatarRef: HeyGenAvatarRef;
}

export interface HeyGenCatalogVoice {
  voiceId: string;
  name: string;
  preview: string;
  index: number;
  ownership: 'private' | 'public';
  connection: HeyGenConnectionRef;
}

/** Internal only: never serialize this receipt through ingredient attributes. */
export interface HeyGenGenerationProvider {
  version: 1;
  provider: 'heygen';
  organizationId: string;
  connection: HeyGenConnectionRef & { credentialVersionId: string };
  avatar: HeyGenAvatarRef | { source: 'photo'; ingredientId?: string };
  speech: {
    provider: string;
    externalVoiceId?: string;
    audioIngredientId?: string;
  };
  submissionId: string;
}

export interface IHeyGen extends IBaseEntity {
  provider: string;
  apiKey?: string;
  metadata?: Record<string, unknown>;
}

interface IHeyGenMediaBase {
  label: string;
  gender?: string;
  preview?: string;
  provider?: string;
  index?: number;
}

export interface IHeyGenVoice extends IHeyGenMediaBase {
  voiceId: string;
}

export interface IHeyGenAvatar extends IHeyGenMediaBase {
  avatarId: string;
  avatarRef?: HeyGenAvatarRef;
}

interface IHeyGenMediaItem {
  preview: string;
  label: string;
  index: number;
}

interface IHeyGenCollectionAttributes<_T extends string> {
  provider: string;
  count: number;
}

interface IHeyGenVoicesAttributes
  extends IHeyGenCollectionAttributes<'voices'> {
  voices: IHeyGenMediaItem[];
}

interface IHeyGenAvatarsAttributes
  extends IHeyGenCollectionAttributes<'avatars'> {
  avatars: IHeyGenMediaItem[];
}

export interface IHeyGenVoicesResponse {
  data: {
    type: 'voices';
    attributes: IHeyGenVoicesAttributes;
  };
}

export interface IHeyGenAvatarsResponse {
  data: {
    type: 'avatars';
    attributes: IHeyGenAvatarsAttributes;
  };
}

export interface IHeyGenStatusResponse {
  data: {
    type: 'service-status';
    attributes: {
      provider: string;
      isConnected: boolean;
      hasCustomKey: boolean;
      error: string | null;
    };
  };
}
