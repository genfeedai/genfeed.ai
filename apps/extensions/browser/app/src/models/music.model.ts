export interface IMusic {
  id?: string;
  url?: string;
  prompt?: string;
  model?: string;
  duration?: number;
  createdAt?: string;
  updatedAt?: string;
}

export class Music implements IMusic {
  id?: string;
  url?: string;
  prompt?: string;
  model?: string;
  duration?: number;
  createdAt?: string;
  updatedAt?: string;

  constructor(partial: Partial<IMusic> = {}) {
    Object.assign(this, partial);
  }
}
