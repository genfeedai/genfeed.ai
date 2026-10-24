import {
  readArticleGenerationInput,
  requiredString,
} from '@api/collections/articles/utils/article-workflow-input.util';
import { describe, expect, it } from 'vitest';

describe('article workflow input', () => {
  it('prefers a nonempty nested DTO and preserves additional request fields', () => {
    const dto = {
      model: 'synthetic-model',
      prompt: '  Nested prompt  ',
      wait: false,
    };
    expect(
      readArticleGenerationInput({ dto, prompt: 'Outer prompt', count: 4 }),
    ).toEqual({ ...dto, count: 1, prompt: 'Nested prompt' });
    expect(dto.prompt).toBe('  Nested prompt  ');
  });
  it('uses the outer request when the nested DTO is empty or not a record', () => {
    expect(readArticleGenerationInput({ dto: {}, topic: '  Topic  ' })).toEqual(
      { count: 1, dto: {}, prompt: 'Topic', topic: '  Topic  ' },
    );
    expect(readArticleGenerationInput({ dto: [], prompt: 'Outer' })).toEqual({
      count: 1,
      dto: [],
      prompt: 'Outer',
    });
  });
  it('uses a topic only when the prompt is nullish', () => {
    expect(
      readArticleGenerationInput({ prompt: null, topic: 'Topic' }).prompt,
    ).toBe('Topic');
    expect(() =>
      readArticleGenerationInput({ prompt: '', topic: 'Topic' }),
    ).toThrow('Missing required article action input: prompt');
  });
  it.each([
    ['long', 7000],
    ['short', 2500],
    ['medium', 4000],
  ])('preserves %s length defaults', (length, targetWordCount) => {
    expect(readArticleGenerationInput({ length, prompt: 'Prompt' })).toEqual({
      count: 1,
      length,
      prompt: 'Prompt',
      targetWordCount,
    });
  });
  it('keeps an explicit numeric target and count ahead of length defaults', () => {
    expect(
      readArticleGenerationInput({
        count: 3,
        length: 'long',
        prompt: 'Prompt',
        targetWordCount: 3200,
      }),
    ).toEqual({
      count: 3,
      length: 'long',
      prompt: 'Prompt',
      targetWordCount: 3200,
    });
    expect(readArticleGenerationInput({ prompt: 'Prompt' })).toEqual({
      count: 1,
      prompt: 'Prompt',
    });
  });
  it('filters typed optional fields and leaves source data unchanged', () => {
    const source = {
      brandId: 1,
      count: '3',
      keywords: ['keyword', 1, null, ''],
      model: 'synthetic-model',
      prompt: 'Prompt',
      targetWordCount: '3200',
      tone: false,
    };
    expect(readArticleGenerationInput(source)).toEqual({
      count: 1,
      keywords: ['keyword', ''],
      model: 'synthetic-model',
      prompt: 'Prompt',
    });
    expect(source).toMatchObject({
      brandId: 1,
      count: '3',
      keywords: ['keyword', 1, null, ''],
      targetWordCount: '3200',
      tone: false,
    });
    expect(
      readArticleGenerationInput({
        brandId: 'brand-1',
        prompt: 'Prompt',
        tone: 'warm',
      }),
    ).toEqual({ brandId: 'brand-1', count: 1, prompt: 'Prompt', tone: 'warm' });
  });
  it.each([undefined, null, [], 'text', 2])(
    'preserves the missing-prompt exception for %s',
    (value) => {
      expect(() => readArticleGenerationInput(value)).toThrow(
        'Missing required article action input: prompt',
      );
    },
  );
  it('trims required strings and retains the field-specific exception', () => {
    expect(requiredString('  article-1  ', 'articleId')).toBe('article-1');
    for (const value of [undefined, null, '', ' ', 1])
      expect(() => requiredString(value, 'articleId')).toThrow(
        'Missing required article action input: articleId',
      );
  });
});
