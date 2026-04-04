import type { IArticle } from '../index';

export type ArticleType = IArticle & {
  generationPrompt?: string;
};
