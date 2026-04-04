import { Ingredient } from '@genfeedai/client/models';
import type { IVoice } from '@genfeedai/interfaces';

export class Voice extends Ingredient implements IVoice {
  public declare duration?: number;
  public declare channels?: number;
  public declare sampleRate?: number;
  public declare isPlaying?: boolean;

  public declare language?: string;
  public declare gender?: string;

  constructor(data: Partial<IVoice> = {}) {
    super(data);
  }
}
