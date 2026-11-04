import { IngredientCategory } from '@genfeedai/contracts';
import {
  buildIngredientFields,
  buildIngredientManagerUrl,
} from '@notifications/services/discord/ingredient-card.util';
import { describe, expect, it } from 'vitest';

describe('buildIngredientFields', () => {
  it('shows the account and its credits left next to the prompt details', () => {
    expect(
      buildIngredientFields({
        brand: { label: 'Review brand' },
        id: 'ingredient-1',
        metadata: { model: 'wan-video/wan-2.2-i2v-fast' },
        owner: {
          creditBalance: 576.4103269999998,
          organizationLabel: 'Acme',
          userEmail: 'owner@example.com',
          userName: 'Ada Owner',
        },
        prompt: { original: 'blue cube' },
      }),
    ).toEqual([
      { inline: false, name: 'Prompt', value: '```\nblue cube\n```' },
      { inline: false, name: 'User', value: 'Ada Owner · owner@example.com' },
      { inline: true, name: 'Organization', value: 'Acme' },
      { inline: true, name: 'Credits left', value: '576.41' },
      { inline: true, name: 'Model', value: 'wan-video/wan-2.2-i2v-fast' },
      { inline: true, name: 'Brand', value: 'Review brand' },
    ]);
  });

  it('falls back to the organization id and shows a zero balance', () => {
    expect(
      buildIngredientFields({
        id: 'ingredient-2',
        owner: { creditBalance: 0, organizationId: 'org_1' },
      }),
    ).toEqual([
      { inline: true, name: 'Organization', value: 'org_1' },
      { inline: true, name: 'Credits left', value: '0' },
    ]);
  });

  it('adds nothing about an account when the owner is unknown', () => {
    expect(buildIngredientFields({ id: 'ingredient-3' })).toEqual([]);
  });

  it('keeps long account values inside the Discord field limit', () => {
    const fields = buildIngredientFields({
      id: 'ingredient-4',
      owner: {
        organizationLabel: 'o'.repeat(1500),
        userEmail: 'u'.repeat(1500),
      },
    });

    expect(fields.map((field) => field.value.length)).toEqual([1024, 1024]);
    expect(fields[0].value.endsWith('...')).toBe(true);
  });
});

describe('buildIngredientFields links', () => {
  const appUrl = 'https://app.genfeed.ai';

  it('links the user to their admin profile and the brand to its admin page', () => {
    const fields = buildIngredientFields(
      {
        brand: { id: 'brand_1', label: 'Review brand' },
        id: 'ingredient-1',
        owner: { userEmail: 'owner@example.com', userId: 'user_1' },
      },
      appUrl,
    );

    expect(fields).toEqual([
      {
        inline: false,
        name: 'User',
        value: '[owner@example.com](https://app.genfeed.ai/admin/users/user_1)',
      },
      {
        inline: true,
        name: 'Brand',
        value: '[Review brand](https://app.genfeed.ai/admin/brands/brand_1)',
      },
    ]);
  });

  it('shows plain text when there is no app origin or no id to link', () => {
    expect(
      buildIngredientFields({
        brand: { label: 'Review brand' },
        id: 'ingredient-1',
        owner: { userEmail: 'owner@example.com', userId: 'user_1' },
      }),
    ).toEqual([
      { inline: false, name: 'User', value: 'owner@example.com' },
      { inline: true, name: 'Brand', value: 'Review brand' },
    ]);
  });

  it('keeps a triple backtick in the prompt from closing the code block', () => {
    const [prompt] = buildIngredientFields({
      id: 'ingredient-1',
      prompt: { original: 'a ```code``` prompt' },
    });

    expect(prompt?.value.split('```')).toHaveLength(3);
  });
});

describe('buildIngredientManagerUrl', () => {
  const appUrl = 'https://app.genfeed.ai';
  const scoped = {
    brand: { slug: 'review' },
    id: 'asset_1',
    owner: { organizationSlug: 'genfeed-review' },
  };

  it.each([
    [
      IngredientCategory.MUSIC,
      '/genfeed-review/review/library/music?asset=asset_1',
    ],
    [
      IngredientCategory.IMAGE,
      '/genfeed-review/review/library/images?asset=asset_1',
    ],
    [
      IngredientCategory.VIDEO,
      '/genfeed-review/review/library/videos?asset=asset_1',
    ],
  ])('opens a %s asset in the current Library route', (category, path) => {
    expect(buildIngredientManagerUrl(appUrl, category, scoped)).toBe(
      `${appUrl}${path}`,
    );
  });

  it('falls back to the admin page for images and videos without slugs', () => {
    expect(
      buildIngredientManagerUrl(appUrl, IngredientCategory.VIDEO, {
        id: 'asset_1',
      }),
    ).toBe(`${appUrl}/admin/content/ingredients/videos/asset_1`);
  });

  it('has no link for a music asset without slugs, or without an app origin', () => {
    expect(
      buildIngredientManagerUrl(appUrl, IngredientCategory.MUSIC, {
        id: 'asset_1',
      }),
    ).toBeNull();
    expect(
      buildIngredientManagerUrl(undefined, IngredientCategory.MUSIC, scoped),
    ).toBeNull();
  });
});
