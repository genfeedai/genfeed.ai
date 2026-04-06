/**
 * Prompt Registry for @genfeedai/prompts
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { PromptCategory, PromptTemplate } from './types.js';

/**
 * Registry of all available prompt templates
 */
export const PROMPT_REGISTRY: Record<string, PromptTemplate> = {
  'blog-outline': {
    category: 'content',
    description: 'Comprehensive blog post outlines for content marketing',
    icon: '📝',
    id: 'blog-outline',
    tags: ['blog', 'content', 'seo', 'marketing'],
    template:
      'Create a detailed blog post outline about {topic} for {audience}, {tone} tone, {format} format, SEO-optimized structure',
    tier: 'free',
    title: 'Blog Post Outline',
    variables: [
      {
        label: 'Blog Topic',
        name: 'topic',
        placeholder: 'e.g., AI in marketing',
        required: true,
        type: 'text',
      },
      {
        default: 'professionals',
        label: 'Target Audience',
        name: 'audience',
        options: ['beginners', 'professionals', 'experts', 'general'],
        type: 'select',
      },
      {
        default: 'informative',
        label: 'Writing Tone',
        name: 'tone',
        options: ['informative', 'conversational', 'authoritative', 'friendly'],
        type: 'select',
      },
      {
        default: 'how-to',
        label: 'Content Format',
        name: 'format',
        options: ['how-to', 'listicle', 'guide', 'analysis'],
        type: 'select',
      },
    ],
    version: 1,
  },
  'brand-ad': {
    category: 'image-generation',
    description: 'Professional brand advertisements that convert and engage',
    icon: '🎯',
    id: 'brand-ad',
    tags: ['brand', 'advertising', 'marketing', 'commercial'],
    template:
      'A {style} advertisement for {brand}, showcasing {product}, {tone} tone, {target} audience, professional marketing photography',
    tier: 'free',
    title: 'Brand Advertisement',
    variables: [
      {
        label: 'Brand Name',
        name: 'brand',
        placeholder: 'e.g., Nike, Apple',
        required: true,
        type: 'text',
      },
      {
        label: 'Product/Service',
        name: 'product',
        placeholder: 'e.g., running shoes',
        required: true,
        type: 'text',
      },
      {
        default: 'lifestyle',
        label: 'Ad Style',
        name: 'style',
        options: ['luxury', 'casual', 'tech', 'lifestyle'],
        type: 'select',
      },
      {
        default: 'premium',
        label: 'Brand Tone',
        name: 'tone',
        options: ['premium', 'friendly', 'innovative', 'trustworthy'],
        type: 'select',
      },
      {
        default: 'young adults',
        label: 'Target Audience',
        name: 'target',
        options: ['young adults', 'professionals', 'families', 'athletes'],
        type: 'select',
      },
    ],
    version: 1,
  },
  'email-sequence': {
    category: 'content',
    description: 'Effective email sequences for nurturing and conversion',
    icon: '📧',
    id: 'email-sequence',
    tags: ['email', 'marketing', 'sequence', 'automation'],
    template:
      'Design a {type} email sequence for {goal}, {length} emails, {audience} audience, {tone} approach, conversion-focused',
    tier: 'free',
    title: 'Email Marketing Sequence',
    variables: [
      {
        default: 'welcome',
        label: 'Sequence Type',
        name: 'type',
        options: ['welcome', 'nurture', 'sales', 'onboarding'],
        type: 'select',
      },
      {
        label: 'Primary Goal',
        name: 'goal',
        placeholder: 'e.g., increase product adoption',
        required: true,
        type: 'text',
      },
      {
        default: '5-email',
        label: 'Number of Emails',
        name: 'length',
        options: ['3-email', '5-email', '7-email', '10-email'],
        type: 'select',
      },
      {
        default: 'new subscribers',
        label: 'Target Audience',
        name: 'audience',
        options: [
          'new subscribers',
          'existing customers',
          'leads',
          'inactive users',
        ],
        type: 'select',
      },
      {
        default: 'friendly',
        label: 'Email Tone',
        name: 'tone',
        options: ['friendly', 'professional', 'urgent', 'educational'],
        type: 'select',
      },
    ],
    version: 1,
  },
  'portrait-headshot': {
    category: 'image-generation',
    description: 'Professional headshots perfect for LinkedIn and business use',
    icon: '👤',
    id: 'portrait-headshot',
    tags: ['portrait', 'headshot', 'professional', 'business'],
    template:
      'A professional {style} headshot of a {subject}, {background} background, {lighting} lighting, confident expression, business attire',
    tier: 'free',
    title: 'Portrait Headshot',
    variables: [
      {
        label: 'Subject',
        name: 'subject',
        placeholder: 'e.g., business executive, entrepreneur',
        required: true,
        type: 'text',
      },
      {
        default: 'corporate',
        label: 'Style',
        name: 'style',
        options: ['corporate', 'creative', 'casual', 'formal'],
        type: 'select',
      },
      {
        default: 'neutral',
        label: 'Background',
        name: 'background',
        options: ['neutral', 'office', 'outdoor', 'studio'],
        type: 'select',
      },
      {
        default: 'natural',
        label: 'Lighting',
        name: 'lighting',
        options: ['natural', 'studio', 'window', 'soft'],
        type: 'select',
      },
    ],
    version: 1,
  },
  'product-demo': {
    category: 'video-generation',
    description: 'Engaging product demonstration videos that showcase features',
    icon: '🎥',
    id: 'product-demo',
    tags: ['product', 'demo', 'video', 'marketing'],
    template:
      'Create a {duration} product demo video for {product}, highlighting {features}, {style} presentation, clear call-to-action',
    tier: 'free',
    title: 'Product Demo Video',
    variables: [
      {
        label: 'Product',
        name: 'product',
        placeholder: 'e.g., smartphone app',
        required: true,
        type: 'text',
      },
      {
        label: 'Key Features',
        name: 'features',
        placeholder: 'e.g., ease of use, speed',
        required: true,
        type: 'text',
      },
      {
        default: '30-second',
        label: 'Duration',
        name: 'duration',
        options: ['15-second', '30-second', '60-second'],
        type: 'select',
      },
      {
        default: 'animated',
        label: 'Presentation Style',
        name: 'style',
        options: ['animated', 'live-action', 'screen-recording', 'hybrid'],
        type: 'select',
      },
    ],
    version: 1,
  },
  'product-photography': {
    category: 'image-generation',
    description:
      'Professional product shots perfect for e-commerce and marketing',
    icon: '📦',
    id: 'product-photography',
    tags: ['product', 'ecommerce', 'photography', 'commercial'],
    template:
      'A professional product photograph of {product}, shot on {background}, {lighting} lighting, {angle} angle, high resolution, commercial quality',
    tier: 'free',
    title: 'Product Photography',
    variables: [
      {
        label: 'Product',
        name: 'product',
        placeholder: 'e.g., wireless headphones',
        required: true,
        type: 'text',
      },
      {
        default: 'white',
        label: 'Background',
        name: 'background',
        options: ['white', 'gradient', 'lifestyle', 'studio'],
        type: 'select',
      },
      {
        default: 'soft',
        label: 'Lighting',
        name: 'lighting',
        options: ['soft', 'dramatic', 'natural', 'studio'],
        type: 'select',
      },
      {
        default: '45-degree',
        label: 'Camera Angle',
        name: 'angle',
        options: ['front', '45-degree', 'top-down', 'eye-level'],
        type: 'select',
      },
    ],
    version: 1,
  },
  'social-caption': {
    category: 'content',
    description: 'Engaging captions that drive interaction and engagement',
    icon: '💬',
    id: 'social-caption',
    tags: ['social', 'caption', 'engagement', 'copywriting'],
    template:
      'Write a {style} caption for {platform} about {topic}, {tone} voice, include {cta}, optimized for engagement',
    tier: 'free',
    title: 'Social Media Caption',
    variables: [
      {
        label: 'Post Topic',
        name: 'topic',
        placeholder: 'e.g., new product launch',
        required: true,
        type: 'text',
      },
      {
        default: 'Instagram',
        label: 'Social Platform',
        name: 'platform',
        options: ['Instagram', 'Facebook', 'Twitter', 'LinkedIn'],
        type: 'select',
      },
      {
        default: 'storytelling',
        label: 'Caption Style',
        name: 'style',
        options: ['storytelling', 'promotional', 'educational', 'humorous'],
        type: 'select',
      },
      {
        default: 'casual',
        label: 'Brand Voice',
        name: 'tone',
        options: ['casual', 'professional', 'playful', 'inspirational'],
        type: 'select',
      },
      {
        default: 'like & comment',
        label: 'Call-to-Action',
        name: 'cta',
        options: [
          'like & comment',
          'share your story',
          'visit link',
          'tag friends',
        ],
        type: 'select',
      },
    ],
    version: 1,
  },
  'social-clip': {
    category: 'video-generation',
    description: 'Short-form video content optimized for social platforms',
    icon: '📹',
    id: 'social-clip',
    tags: ['social', 'short-form', 'viral', 'content'],
    template:
      'A {duration} social media clip about {topic}, {style} style, {platform} optimized, engaging hook, trending format',
    tier: 'free',
    title: 'Social Media Clip',
    variables: [
      {
        label: 'Topic/Theme',
        name: 'topic',
        placeholder: 'e.g., cooking tips, workout routine',
        required: true,
        type: 'text',
      },
      {
        default: '30 seconds',
        label: 'Duration',
        name: 'duration',
        options: ['15 seconds', '30 seconds', '60 seconds'],
        type: 'select',
      },
      {
        default: 'entertaining',
        label: 'Video Style',
        name: 'style',
        options: ['educational', 'entertaining', 'inspiring', 'promotional'],
        type: 'select',
      },
      {
        default: 'Instagram Reels',
        label: 'Target Platform',
        name: 'platform',
        options: ['TikTok', 'Instagram Reels', 'YouTube Shorts', 'Twitter'],
        type: 'select',
      },
    ],
    version: 1,
  },
  'social-media-post': {
    category: 'image-generation',
    description: 'Eye-catching images optimized for social media engagement',
    icon: '📱',
    id: 'social-media-post',
    tags: ['social', 'media', 'marketing', 'engagement'],
    template:
      'A {style} social media post featuring {subject}, {mood} mood, {platform} optimized, trending design, vibrant colors',
    tier: 'free',
    title: 'Social Media Post',
    variables: [
      {
        label: 'Subject',
        name: 'subject',
        placeholder: 'e.g., coffee shop, workout',
        required: true,
        type: 'text',
      },
      {
        default: 'vibrant',
        label: 'Style',
        name: 'style',
        options: ['minimalist', 'vibrant', 'artistic', 'corporate'],
        type: 'select',
      },
      {
        default: 'energetic',
        label: 'Mood',
        name: 'mood',
        options: ['energetic', 'calm', 'professional', 'playful'],
        type: 'select',
      },
      {
        default: 'Instagram',
        label: 'Platform',
        name: 'platform',
        options: ['Instagram', 'Facebook', 'Twitter', 'LinkedIn'],
        type: 'select',
      },
    ],
    version: 1,
  },
  'ugc-testimonial': {
    category: 'video-generation',
    description: 'Authentic user-generated content style testimonial videos',
    icon: '🗣️',
    id: 'ugc-testimonial',
    tags: ['ugc', 'testimonial', 'authentic', 'conversion'],
    template:
      'A {style} UGC testimonial video for {product}, featuring {scenario}, authentic {tone} delivery, mobile-first format',
    tier: 'free',
    title: 'UGC Testimonial',
    variables: [
      {
        label: 'Product/Service',
        name: 'product',
        placeholder: 'e.g., skincare routine',
        required: true,
        type: 'text',
      },
      {
        label: 'Usage Scenario',
        name: 'scenario',
        placeholder: 'e.g., morning routine',
        required: true,
        type: 'text',
      },
      {
        default: 'review',
        label: 'UGC Style',
        name: 'style',
        options: ['before-after', 'day-in-life', 'review', 'tutorial'],
        type: 'select',
      },
      {
        default: 'casual',
        label: 'Delivery Tone',
        name: 'tone',
        options: ['casual', 'enthusiastic', 'honest', 'expert'],
        type: 'select',
      },
    ],
    version: 1,
  },
};

/**
 * Available prompt categories
 */
export const PROMPT_CATEGORIES: PromptCategory[] = [
  {
    count: 4,
    description: 'Prompts for creating AI-generated images',
    icon: '🎨',
    id: 'image-generation',
    name: 'Image Generation',
  },
  {
    count: 3,
    description: 'Prompts for creating AI-generated videos',
    icon: '🎬',
    id: 'video-generation',
    name: 'Video Generation',
  },
  {
    count: 3,
    description: 'Prompts for text and content generation',
    icon: '✍️',
    id: 'content',
    name: 'Content Creation',
  },
];

/**
 * Get all prompt templates
 */
export function getAllPrompts(): PromptTemplate[] {
  return Object.values(PROMPT_REGISTRY);
}

/**
 * Get prompt template by ID
 */
export function getPrompt(id: string): PromptTemplate | undefined {
  return PROMPT_REGISTRY[id];
}

/**
 * Get prompt template JSON by ID
 */
export function getPromptJson(id: string): PromptTemplate | undefined {
  try {
    const category = PROMPT_REGISTRY[id]?.category;
    if (!category) return undefined;

    const promptPath = path.join(
      __dirname,
      '..',
      'prompts',
      category,
      `${id}.json`,
    );
    const jsonContent = fs.readFileSync(promptPath, 'utf-8');
    return JSON.parse(jsonContent);
  } catch (_error) {
    return PROMPT_REGISTRY[id];
  }
}

/**
 * Get prompts by category
 */
export function getPromptsByCategory(category: string): PromptTemplate[] {
  return Object.values(PROMPT_REGISTRY).filter((p) => p.category === category);
}

/**
 * Search prompts by tag
 */
export function searchPromptsByTag(tag: string): PromptTemplate[] {
  return Object.values(PROMPT_REGISTRY).filter((p) =>
    p.tags.some((t) => t.toLowerCase().includes(tag.toLowerCase())),
  );
}

/**
 * Get all prompt categories
 */
export function getPromptCategories(): PromptCategory[] {
  return PROMPT_CATEGORIES;
}
