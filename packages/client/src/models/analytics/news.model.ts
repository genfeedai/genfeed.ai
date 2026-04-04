import type { INews } from '@genfeedai/interfaces';

export class News implements INews {
  public declare id: string;
  public declare title: string;
  public declare description?: string;
  public declare image?: string;
  public declare url: string;
  public declare publishedAt?: string;

  constructor(data: Partial<INews> = {}) {
    Object.assign(this, data);
  }
}
