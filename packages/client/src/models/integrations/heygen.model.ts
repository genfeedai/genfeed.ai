import { BaseEntity } from '@genfeedai/client/models/base/base-entity.model';
import type {
  IHeyGen,
  IHeyGenAvatar,
  IHeyGenVoice,
} from '@genfeedai/interfaces';

export class HeyGen extends BaseEntity implements IHeyGen {
  public declare provider: string;
  public declare apiKey?: string;
  public declare metadata?: Record<string, unknown>;

  constructor(data: Partial<IHeyGen> = {}) {
    super(data);
  }
}

export class HeyGenAvatar implements IHeyGenAvatar {
  public declare avatarId: string;
  public declare label: string;
  public declare gender?: string;
  public declare preview?: string;
  public declare provider?: string;
  public declare index?: number;

  constructor(data: Partial<IHeyGenAvatar> = {}) {
    Object.assign(this, data);
  }
}

export class HeyGenVoice implements IHeyGenVoice {
  public declare voiceId: string;
  public declare label: string;
  public declare gender?: string;
  public declare preview?: string;
  public declare provider?: string;
  public declare index?: number;

  constructor(data: Partial<IHeyGenVoice> = {}) {
    Object.assign(this, data);
  }
}
