import { BotActivity as BaseBotActivity } from '@genfeedai/client/models';
import type { IBotActivity } from '@genfeedai/interfaces';

export class BotActivity extends BaseBotActivity {
  constructor(partial: Partial<IBotActivity> = {}) {
    super(partial);

    this.dmSent = partial.dmSent ?? false;
  }
}
