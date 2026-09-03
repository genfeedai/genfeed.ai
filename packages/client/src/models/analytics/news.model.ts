import type { INews } from '@genfeedai/contracts/interfaces';

export class News implements INews {
  declare public id: string;
  declare public title: string;
  declare public description?: string;
  declare public image?: string;
  declare public url: string;
  declare public publishedAt?: string;

  constructor(data: Partial<INews> = {}) {
    Object.assign(this, data);
  }
}
