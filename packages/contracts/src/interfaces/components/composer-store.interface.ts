import type { IBrand } from '../index';

export interface IComposerDraft {
  tweets: string[];
  scheduledAt?: string;
}

export interface IComposerStore {
  draft: IComposerDraft;
  brands: IBrand[];
  selectedBrandIds: string[];
  role: 'Owner' | 'Member';
  addTweet: () => void;
  removeTweet: (index: number) => void;
  updateTweet: (index: number, text: string) => void;
  moveTweet: (from: number, to: number) => void;
  setBrands: (brands: IBrand[]) => void;
  toggleAccount: (id: string) => void;
  clearDraft: () => void;
}
