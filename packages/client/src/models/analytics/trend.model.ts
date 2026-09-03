import type { ITrend } from '@genfeedai/contracts/interfaces';

export class Trend implements ITrend {
  declare public platform: string;
  declare public topic: string;
  declare public mentions: number;

  constructor(data: Partial<ITrend> = {}) {
    Object.assign(this, data);
  }
}
