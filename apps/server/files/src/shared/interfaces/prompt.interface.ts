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
  account?: IAccountData;
}

export interface IPromptParserOptions {
  account?: unknown;
  originalPrompt: string;
  type: string;
}

export interface IPromptParserResult {
  promptObject: IPromptObject;
  promptString: string;
  normalizedType: string;
}
