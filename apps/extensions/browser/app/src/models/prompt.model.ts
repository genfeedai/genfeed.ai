export interface IPrompt {
  id?: string;
  text?: string;
  response?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  createdAt?: string;
  updatedAt?: string;
}

export class Prompt implements IPrompt {
  id?: string;
  text?: string;
  response?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  createdAt?: string;
  updatedAt?: string;

  constructor(partial: Partial<IPrompt> = {}) {
    Object.assign(this, partial);
  }
}
