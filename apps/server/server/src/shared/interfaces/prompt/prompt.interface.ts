import { PromptCategory } from '@genfeedai/enums';

export interface IAccountData {
  label: string;
  description: string;
  systemPrompt: string;
  primaryColor?: string;
  secondaryColor?: string;
  backgroundColor?: string;
}

export interface IPromptObject {
  prompt: string;
  brand?: IAccountData;
}

export interface IPromptBrandContext {
  label?: string;
  description?: string;
  text?: string;
  primaryColor?: string;
  secondaryColor?: string;
  backgroundColor?: string;
}

export interface IPromptParserOptions {
  brand?: IPromptBrandContext | null;
  originalPrompt: string;
  category: string;
}

export interface IPromptParserResult {
  promptObject: IPromptObject;
  promptString: string;
  normalizedType: PromptCategory;
}
