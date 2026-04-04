import { describe, expect, test } from 'bun:test';
import {
  getAllPrompts,
  getPrompt,
  getPromptCategories,
  getPromptsByCategory,
  PROMPT_REGISTRY,
  searchPromptsByTag,
} from '../src/index';

describe('Prompt Registry', () => {
  test('should export all required prompts', () => {
    const expectedPrompts = [
      'product-photography',
      'social-media-post',
      'brand-ad',
      'portrait-headshot',
      'product-demo',
      'social-clip',
      'ugc-testimonial',
      'blog-outline',
      'social-caption',
      'email-sequence',
    ];

    const promptIds = Object.keys(PROMPT_REGISTRY);
    expectedPrompts.forEach((id) => {
      expect(promptIds).toContain(id);
    });
  });

  test('getAllPrompts should return all prompt templates', () => {
    const prompts = getAllPrompts();
    expect(prompts).toHaveLength(10);

    prompts.forEach((prompt) => {
      expect(prompt).toHaveProperty('id');
      expect(prompt).toHaveProperty('title');
      expect(prompt).toHaveProperty('description');
      expect(prompt).toHaveProperty('category');
      expect(prompt).toHaveProperty('tier');
      expect(prompt).toHaveProperty('template');
      expect(prompt).toHaveProperty('variables');
      expect(prompt).toHaveProperty('tags');
      expect(prompt.tier).toBe('free');
      expect(prompt.variables).toBeInstanceOf(Array);
    });
  });

  test('getPrompt should return prompt template by ID', () => {
    const prompt = getPrompt('product-photography');
    expect(prompt).toBeDefined();
    expect(prompt?.id).toBe('product-photography');
    expect(prompt?.title).toBe('Product Photography');
    expect(prompt?.category).toBe('image-generation');

    const nonExistent = getPrompt('non-existent');
    expect(nonExistent).toBeUndefined();
  });

  test('getPromptsByCategory should filter prompts correctly', () => {
    const imagePrompts = getPromptsByCategory('image-generation');
    expect(imagePrompts).toHaveLength(4);
    imagePrompts.forEach((prompt) => {
      expect(prompt.category).toBe('image-generation');
    });

    const videoPrompts = getPromptsByCategory('video-generation');
    expect(videoPrompts).toHaveLength(3);
    videoPrompts.forEach((prompt) => {
      expect(prompt.category).toBe('video-generation');
    });

    const contentPrompts = getPromptsByCategory('content');
    expect(contentPrompts).toHaveLength(3);
    contentPrompts.forEach((prompt) => {
      expect(prompt.category).toBe('content');
    });
  });

  test('searchPromptsByTag should find prompts by tag', () => {
    const socialPrompts = searchPromptsByTag('social');
    expect(socialPrompts.length).toBeGreaterThan(0);
    socialPrompts.forEach((prompt) => {
      expect(
        prompt.tags.some((tag) => tag.toLowerCase().includes('social')),
      ).toBe(true);
    });

    const marketingPrompts = searchPromptsByTag('marketing');
    expect(marketingPrompts.length).toBeGreaterThan(0);
    marketingPrompts.forEach((prompt) => {
      expect(
        prompt.tags.some((tag) => tag.toLowerCase().includes('marketing')),
      ).toBe(true);
    });

    const nonExistent = searchPromptsByTag('nonexistent');
    expect(nonExistent).toHaveLength(0);
  });

  test('getPromptCategories should return valid categories', () => {
    const categories = getPromptCategories();
    expect(categories).toHaveLength(3);

    const expectedCategories = [
      'image-generation',
      'video-generation',
      'content',
    ];
    categories.forEach((category) => {
      expect(expectedCategories).toContain(category.id);
      expect(category).toHaveProperty('name');
      expect(category).toHaveProperty('description');
      expect(category).toHaveProperty('icon');
      expect(category).toHaveProperty('count');
      expect(category.count).toBeGreaterThan(0);
    });
  });

  test('prompt variables should have proper structure', () => {
    const prompt = getPrompt('product-photography');
    expect(prompt?.variables).toBeInstanceOf(Array);
    expect(prompt!.variables.length).toBeGreaterThan(0);

    prompt!.variables.forEach((variable) => {
      expect(variable).toHaveProperty('name');
      expect(variable).toHaveProperty('label');
      expect(variable).toHaveProperty('type');
      expect(['text', 'select', 'number', 'boolean']).toContain(variable.type);

      if (variable.type === 'select') {
        expect(variable).toHaveProperty('options');
        expect(variable.options).toBeInstanceOf(Array);
        expect(variable.options!.length).toBeGreaterThan(0);
      }
    });
  });

  test('prompt templates should contain variable placeholders', () => {
    getAllPrompts().forEach((prompt) => {
      const variableNames = prompt.variables.map((v) => v.name);
      variableNames.forEach((varName) => {
        const placeholder = `{${varName}}`;
        expect(prompt.template).toContain(placeholder);
      });
    });
  });

  test('all prompts should have required fields for marketplace', () => {
    Object.values(PROMPT_REGISTRY).forEach((prompt) => {
      // Required marketplace fields
      expect(prompt.id).toBeDefined();
      expect(prompt.title).toBeDefined();
      expect(prompt.description).toBeDefined();
      expect(prompt.category).toBeDefined();
      expect(['image-generation', 'video-generation', 'content']).toContain(
        prompt.category,
      );
      expect(prompt.tier).toBe('free');
      expect(prompt.template).toBeDefined();
      expect(prompt.variables).toBeInstanceOf(Array);
      expect(prompt.tags).toBeInstanceOf(Array);

      // Ensure non-empty arrays
      expect(prompt.tags.length).toBeGreaterThan(0);
      expect(prompt.variables.length).toBeGreaterThan(0);

      // Template should not be empty
      expect(prompt.template.trim().length).toBeGreaterThan(0);
    });
  });

  test('categories should have correct counts', () => {
    const categories = getPromptCategories();
    const imageCategory = categories.find((c) => c.id === 'image-generation');
    const videoCategory = categories.find((c) => c.id === 'video-generation');
    const contentCategory = categories.find((c) => c.id === 'content');

    expect(imageCategory?.count).toBe(4);
    expect(videoCategory?.count).toBe(3);
    expect(contentCategory?.count).toBe(3);
  });
});
