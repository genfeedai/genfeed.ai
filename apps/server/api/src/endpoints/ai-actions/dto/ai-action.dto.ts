import { IsEnum, IsObject, IsOptional, IsString } from 'class-validator';

export enum AiActionType {
  ENHANCE_PROMPT = 'enhance-prompt',
  REWRITE = 'rewrite',
  SHORTEN = 'shorten',
  EXPAND = 'expand',
  TONE_ADJUST = 'tone-adjust',
  SEO_OPTIMIZE = 'seo-optimize',
  ADD_HASHTAGS = 'add-hashtags',
  HOOK_GENERATOR = 'hook-generator',
  ADAPT_PLATFORM = 'adapt-platform',
  GRAMMAR_CHECK = 'grammar-check',
  EXPLAIN_METRIC = 'explain-metric',
  SUGGEST_KEYWORDS = 'suggest-keywords',
  CONTENT_SUGGEST = 'content-suggest',
  ANALYTICS_INSIGHT = 'analytics-insight',
}

export class ExecuteAiActionDto {
  @IsEnum(AiActionType)
  action!: AiActionType;

  @IsString()
  content!: string;

  @IsOptional()
  @IsObject()
  context?: Record<string, string>;
}

export class StreamAiActionDto extends ExecuteAiActionDto {}
