export interface IVideo {
  id?: string;
  url?: string;
  prompt?: string;
  model?: string;
  duration?: number;
  width?: number;
  height?: number;
  createdAt?: string;
  updatedAt?: string;
}

export class Video implements IVideo {
  id?: string;
  url?: string;
  prompt?: string;
  model?: string;
  duration?: number;
  width?: number;
  height?: number;
  createdAt?: string;
  updatedAt?: string;

  constructor(partial: Partial<IVideo> = {}) {
    Object.assign(this, partial);
  }
}
