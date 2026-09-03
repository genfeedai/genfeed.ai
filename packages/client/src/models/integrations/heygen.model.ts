import { BaseEntity } from '@genfeedai/client/models/base/base-entity.model';
import type {
  IHeyGen,
  IHeyGenAvatar,
  IHeyGenVoice,
} from '@genfeedai/contracts/interfaces';

export class HeyGen extends BaseEntity implements IHeyGen {
  declare public provider: string;
  declare public apiKey?: string;
  declare public metadata?: Record<string, unknown>;

  constructor(data: Partial<IHeyGen> = {}) {
    super(data);
  }
}

export class HeyGenAvatar implements IHeyGenAvatar {
  declare public avatarId: string;
  declare public label: string;
  declare public gender?: string;
  declare public preview?: string;
  declare public provider?: string;
  declare public index?: number;

  constructor(data: Partial<IHeyGenAvatar> = {}) {
    Object.assign(this, data);
  }
}

export class HeyGenVoice implements IHeyGenVoice {
  declare public voiceId: string;
  declare public label: string;
  declare public gender?: string;
  declare public preview?: string;
  declare public provider?: string;
  declare public index?: number;

  constructor(data: Partial<IHeyGenVoice> = {}) {
    Object.assign(this, data);
  }
}
