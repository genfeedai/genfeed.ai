import { MoodBoard as BaseMoodBoard } from '@genfeedai/client/models';
import type { IMoodBoard } from '@genfeedai/interfaces';

export class MoodBoard extends BaseMoodBoard {
  constructor(partial: Partial<IMoodBoard>) {
    super(partial);
  }
}
