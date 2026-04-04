import { IngredientCategory, IngredientStatus } from '@genfeedai/enums';
import { describe, expect, it } from 'vitest';
import {
  buildAvatarVoiceOption,
  DEFAULT_INGREDIENT_STATUSES,
  formatDuration,
  getMetadataString,
  isImageOrVideoCategory,
  PROMPT_STORAGE_KEY,
  resolveAvatarPreviewUrl,
} from './helpers';

describe('studio generate helpers', () => {
  it('identifies image and video categories', () => {
    expect(isImageOrVideoCategory(IngredientCategory.IMAGE)).toBe(true);
    expect(isImageOrVideoCategory(IngredientCategory.VIDEO)).toBe(true);
  });

  it('keeps the default statuses stable', () => {
    expect(DEFAULT_INGREDIENT_STATUSES).toEqual([
      IngredientStatus.PROCESSING,
      IngredientStatus.GENERATED,
      IngredientStatus.VALIDATED,
    ]);
    expect(PROMPT_STORAGE_KEY).toBe('studio_promptbar_state');
  });

  it('reads metadata values and avatar previews', () => {
    expect(getMetadataString({ label: 'Narrator' }, 'label')).toBe('Narrator');
    expect(
      resolveAvatarPreviewUrl({ metadata: { poster: 'poster.png' } } as never),
    ).toBe('poster.png');
  });

  it('formats avatar voice options and durations', () => {
    expect(
      buildAvatarVoiceOption({
        id: 'voice_1',
        metadata: { language: 'English', tone: 'Warm' },
        metadataLabel: 'Host',
        provider: 'hedra',
      } as never),
    ).toMatchObject({
      badge: 'hedra',
      badgeVariant: 'secondary',
      key: 'voice_1',
    });
    expect(formatDuration(125)).toBe('2:05');
    expect(formatDuration(undefined)).toBeNull();
  });
});
