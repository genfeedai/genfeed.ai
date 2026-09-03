import { Ingredient } from '@genfeedai/client/models';
import type { IVoice } from '@genfeedai/contracts/interfaces';

export class Voice extends Ingredient implements IVoice {
  declare public duration?: number;
  declare public channels?: number;
  declare public sampleRate?: number;
  declare public isPlaying?: boolean;

  declare public language?: string;
  declare public gender?: string;

  constructor(data: Partial<IVoice> = {}) {
    super(data);
  }
}
