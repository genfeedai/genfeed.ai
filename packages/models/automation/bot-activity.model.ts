import type { IBotActivity } from '@cloud/interfaces';
import { BotActivity as BaseBotActivity } from '@genfeedai/client/models';

export class BotActivity extends BaseBotActivity {
  constructor(partial: Partial<IBotActivity> = {}) {
    super(partial);

    this.dmSent = partial.dmSent ?? false;
  }
}
