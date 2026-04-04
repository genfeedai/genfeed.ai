export interface IImage {
  id?: string;
  url?: string;
  prompt?: string;
  model?: string;
  width?: number;
  height?: number;
  createdAt?: string;
  updatedAt?: string;
}

export class Image implements IImage {
  id?: string;
  url?: string;
  prompt?: string;
  model?: string;
  width?: number;
  height?: number;
  createdAt?: string;
  updatedAt?: string;

  constructor(partial: Partial<IImage> = {}) {
    Object.assign(this, partial);
  }
}
