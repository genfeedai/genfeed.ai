import type { IBaseEntity } from '../index';

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
