import type { ITrend } from '@genfeedai/contracts/interfaces';

export class Trend implements ITrend {
  public declare platform: string;
  public declare topic: string;
  public declare mentions: number;

  constructor(data: Partial<ITrend> = {}) {
    Object.assign(this, data);
  }
}
