export interface IJudgePromptSource {
  enhanced?: string;
  original?: string;
}

export interface IJudgeBrandSource {
  name?: string;
  guidelines?: string;
}

export interface IJudgeArticleSource {
  category?: unknown;
  label?: unknown;
  summary?: unknown;
}

export interface IJudgeArticleContentSource {
  content?: string | null;
}

export interface IJudgePostChildrenSource {
  getChildren(postId: string): Promise<unknown>;
}
