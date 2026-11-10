import { IngredientCategory, IngredientStatus } from '@genfeedai/contracts';
import type { IMetadata, IPrompt } from '@genfeedai/contracts/interfaces';
import { Ingredient } from '@models/content/ingredient.model';
import { describe, expect, it } from 'vitest';
import {
  buildRecreatePrompt,
  splitArticleBody,
  toArticleGenerationBlocks,
} from './article-generations';

const BLOCK =
  '<figure data-genfeed-generation="image" data-ingredient-id="ing-1"></figure>';

describe('splitArticleBody', () => {
  it('cuts the body around each generation block', () => {
    expect(splitArticleBody(`<p>Before</p>${BLOCK}<p>After</p>`)).toEqual([
      { html: '<p>Before</p>', key: 'html-0', kind: 'html' },
      { ingredientId: 'ing-1', key: 'generation-13', kind: 'generation' },
      { html: '<p>After</p>', key: 'html-89', kind: 'html' },
    ]);
  });

  it.each([
    [
      '<p>No blocks</p>',
      [{ html: '<p>No blocks</p>', key: 'html-0', kind: 'html' }],
    ],
    [
      '<figure><img src="https://x.test/a.jpg"></figure>',
      [
        {
          html: '<figure><img src="https://x.test/a.jpg"></figure>',
          key: 'html-0',
          kind: 'html',
        },
      ],
    ],
    ['<figure data-genfeed-generation="image"></figure>', []],
  ])('%s', (html, expected) => {
    expect(splitArticleBody(html)).toEqual(expected);
  });
});

describe('toArticleGenerationBlocks', () => {
  /** A generated asset as the public API returns it. */
  function generated(
    id: string,
    state: 'PENDING' | 'READY',
    metadata?: Partial<IMetadata>,
    prompt?: Partial<IPrompt>,
  ): Ingredient {
    const ingredient = new Ingredient({
      category: IngredientCategory.IMAGE,
      id,
      metadata: metadata as IMetadata | undefined,
      prompt: prompt as IPrompt | undefined,
      status: IngredientStatus.GENERATED,
    });
    ingredient.mediaDelivery = {
      expiresAt: null,
      id,
      purpose: 'public-share',
      state,
      url: state === 'READY' ? `https://cdn.test/${id}.jpg` : null,
    };
    return ingredient;
  }

  const image = generated(
    'ing-1',
    'READY',
    {
      description: 'A bear sheet for the cast.',
      height: 1024,
      label: 'Bear Sheet',
      model: 'flux-2',
      width: 1024,
    },
    { original: 'A friendly bear, character sheet' },
  );

  it('keeps what the block renders, with the catalog model label', () => {
    expect(toArticleGenerationBlocks([image], { 'flux-2': 'Flux 2' })).toEqual({
      'ing-1': {
        description: 'A bear sheet for the cast.',
        height: 1024,
        id: 'ing-1',
        kind: 'image',
        label: 'Bear Sheet',
        modelKey: 'flux-2',
        modelLabel: 'Flux 2',
        prompt: 'A friendly bear, character sheet',
        url: 'https://cdn.test/ing-1.jpg',
        width: 1024,
      },
    });
  });

  it('drops the placeholder description nobody wrote', () => {
    const blocks = toArticleGenerationBlocks(
      [generated('ing-3', 'READY', { description: 'Default Description' })],
      {},
    );

    expect(blocks['ing-3']?.description).toBeNull();
  });

  it('leaves out an asset that has no deliverable URL yet', () => {
    const pending = generated('ing-2', 'PENDING');

    expect(toArticleGenerationBlocks([pending], {})).toEqual({});
  });
});

describe('buildRecreatePrompt', () => {
  it.each([
    [
      { kind: 'image' as const, modelLabel: 'Flux 2', prompt: 'A bear' },
      'Recreate this image with Flux 2: A bear',
    ],
    [
      { kind: 'video' as const, modelLabel: null, prompt: 'A bear' },
      'Recreate this video: A bear',
    ],
    [{ kind: 'image' as const, modelLabel: 'Flux 2', prompt: null }, null],
  ])('%j', (generation, expected) => {
    expect(buildRecreatePrompt(generation)).toBe(expected);
  });
});
