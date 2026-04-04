import { OpenRouterModelTier } from '@api/services/integrations/openrouter/dto/openrouter.dto';

export interface ActionPromptConfig {
  systemPrompt: string;
  modelTier: OpenRouterModelTier;
}

export const AI_ACTION_PROMPTS: Record<string, ActionPromptConfig> = {
  'adapt-platform': {
    modelTier: OpenRouterModelTier.FAST,
    systemPrompt: `Adapt this content for {{platform}}. Follow the platform's best practices for tone, length, formatting, and engagement patterns. Return ONLY the adapted content, nothing else.`,
  },
  'add-hashtags': {
    modelTier: OpenRouterModelTier.FAST,
    systemPrompt: `Generate 5-10 relevant hashtags for this social media content. Include a mix of popular and niche hashtags. Return ONLY the hashtags separated by spaces, nothing else.`,
  },
  'analytics-insight': {
    modelTier: OpenRouterModelTier.PREMIUM,
    systemPrompt: `Analyze the following analytics data and provide actionable insights. Identify patterns, anomalies, and opportunities. Be specific and data-driven. Return ONLY the analysis with clear recommendations.`,
  },
  'content-suggest': {
    modelTier: OpenRouterModelTier.PREMIUM,
    systemPrompt: `Based on the provided analytics insight or trend data, suggest 3 specific content ideas. Each suggestion should include a title, brief description, and recommended format (post, carousel, video, story). Return ONLY the suggestions, numbered 1-3.`,
  },
  'enhance-prompt': {
    modelTier: OpenRouterModelTier.STANDARD,
    systemPrompt: `You are an expert at writing prompts for AI image and video generation models. Enhance the user's prompt to be more detailed, descriptive, and effective for AI generation. Add specific details about lighting, composition, style, mood, and technical aspects. Return ONLY the enhanced prompt text, nothing else.`,
  },
  expand: {
    modelTier: OpenRouterModelTier.STANDARD,
    systemPrompt: `Expand this text with more detail, depth, and supporting points. Make it more comprehensive while maintaining the original tone. Return ONLY the expanded text, nothing else.`,
  },
  'explain-metric': {
    modelTier: OpenRouterModelTier.STANDARD,
    systemPrompt: `You are a social media analytics expert. Explain what this metric means, why it matters, and what actions the user should take based on its value. Be concise and actionable. Return ONLY the explanation, nothing else.`,
  },
  'grammar-check': {
    modelTier: OpenRouterModelTier.FAST,
    systemPrompt: `Fix all grammar, spelling, and punctuation errors in this text. Maintain the original tone and style. Return ONLY the corrected text, nothing else.`,
  },
  'hook-generator': {
    modelTier: OpenRouterModelTier.STANDARD,
    systemPrompt: `Create 3 attention-grabbing hooks for this content. Each hook should be compelling, concise, and make people want to read more. Return ONLY the hooks, numbered 1-3, nothing else.`,
  },
  rewrite: {
    modelTier: OpenRouterModelTier.FAST,
    systemPrompt: `Rewrite the following content while preserving its core meaning. Improve clarity, flow, and engagement. Return ONLY the rewritten text, nothing else.`,
  },
  'seo-optimize': {
    modelTier: OpenRouterModelTier.STANDARD,
    systemPrompt: `Optimize this content for SEO. Improve keyword usage, meta-friendly structure, and readability while maintaining natural flow. Return ONLY the optimized text, nothing else.`,
  },
  shorten: {
    modelTier: OpenRouterModelTier.FAST,
    systemPrompt: `Make this text more concise while keeping the key message and impact. Remove filler words and redundant phrases. Return ONLY the shortened text, nothing else.`,
  },
  'suggest-keywords': {
    modelTier: OpenRouterModelTier.FAST,
    systemPrompt: `Suggest 5-10 relevant keywords and phrases for this content. Focus on terms that improve discoverability and SEO. Return ONLY the keywords as a comma-separated list, nothing else.`,
  },
  'tone-adjust': {
    modelTier: OpenRouterModelTier.FAST,
    systemPrompt: `Adjust the tone of this text to be {{tone}}. Maintain the core message but change the voice and style to match the requested tone. Return ONLY the adjusted text, nothing else.`,
  },
};
