import { buildIngredientFields } from '@notifications/services/discord/ingredient-card.util';
import { describe, expect, it } from 'vitest';

describe('buildIngredientFields', () => {
  it('shows the account and its credits left next to the prompt details', () => {
    expect(
      buildIngredientFields({
        brand: { label: 'Review brand' },
        id: 'ingredient-1',
        metadata: { model: 'wan-video/wan-2.2-i2v-fast' },
        owner: {
          creditBalance: 13,
          organizationLabel: 'Acme',
          userEmail: 'owner@example.com',
          userName: 'Ada Owner',
        },
        prompt: { original: 'blue cube' },
      }),
    ).toEqual([
      { inline: false, name: 'Prompt', value: 'blue cube' },
      { inline: false, name: 'User', value: 'Ada Owner · owner@example.com' },
      { inline: true, name: 'Organization', value: 'Acme' },
      { inline: true, name: 'Credits left', value: '13' },
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
