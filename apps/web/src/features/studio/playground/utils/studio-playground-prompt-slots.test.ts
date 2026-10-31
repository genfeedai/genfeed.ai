import type { IIngredient, IPrompt } from '@genfeedai/contracts/interfaces';
import { describe, expect, it } from 'vitest';
import {
  isStudioPromptSlotVisible,
  readStoredPrompt,
} from './studio-playground-prompt-slots';
import { recipeFromIngredient } from './studio-playground-recipe';

function ingredientWithPrompt(prompt: Partial<IPrompt> | string): IIngredient {
  return { brandId: 'brand-1', id: 'ing-1', prompt } as IIngredient;
}

const PROMPT = {
  action: 'turns toward the window',
  blacklists: ['text overlay'],
  lighting: 'soft window light',
  original: 'A founder at a desk',
  renderedPrompt: 'A founder at a desk, turns toward the window.',
  renderTarget: 'prose',
  sounds: ['rain', 'keyboard'],
  speech: 'Welcome back',
  subject: 'a founder',
};

describe('readStoredPrompt', () => {
  it('lists the filled slots in a fixed order with the text that was sent', () => {
    const stored = readStoredPrompt(
      ingredientWithPrompt(PROMPT),
      'video',
      true,
    );

    expect(stored?.slots).toEqual([
      { key: 'subject', value: 'a founder' },
      { key: 'action', value: 'turns toward the window' },
      { key: 'lighting', value: 'soft window light' },
      { key: 'sounds', value: 'rain, keyboard' },
      { key: 'speech', value: 'Welcome back' },
      { key: 'blacklists', value: 'text overlay' },
    ]);
    expect(stored?.renderedPrompt).toBe(PROMPT.renderedPrompt);
    expect(stored?.renderTarget).toBe('prose');
  });

  it('hides sounds and speech on a video with audio turned off', () => {
    const keys = readStoredPrompt(
      ingredientWithPrompt(PROMPT),
      'video',
      false,
    )?.slots.map((slot) => slot.key);

    expect(keys).not.toContain('sounds');
    expect(keys).not.toContain('speech');
    expect(keys).toContain('lighting');
  });

  it('never shows sounds or speech on an image', () => {
    expect(isStudioPromptSlotVisible('sounds', 'image', true)).toBe(false);
    expect(isStudioPromptSlotVisible('speech', 'image-edit', true)).toBe(false);
    expect(isStudioPromptSlotVisible('speech', 'voice', false)).toBe(true);
  });

  it('reads as nothing for a generation that stored no slots or sent text', () => {
    expect(
      readStoredPrompt(
        ingredientWithPrompt({ original: 'A founder', enhanced: 'A founder.' }),
        'image',
        false,
      ),
    ).toBeNull();
    expect(
      readStoredPrompt(ingredientWithPrompt('prompt-id'), 'image', false),
    ).toBeNull();
    expect(readStoredPrompt(undefined, 'image', false)).toBeNull();
  });
});

describe('recipeFromIngredient with a stored prompt row', () => {
  it('restores the slots the ingredient metadata never kept', () => {
    const recipe = recipeFromIngredient(ingredientWithPrompt(PROMPT), 'video');

    expect(recipe).toMatchObject({
      action: 'turns toward the window',
      blacklist: ['text overlay'],
      lighting: 'soft window light',
      speech: 'Welcome back',
      subject: 'a founder',
    });
  });

  it('prefers a value the metadata did record', () => {
    const recipe = recipeFromIngredient(
      {
        ...ingredientWithPrompt(PROMPT),
        metadata: { lighting: 'golden hour' },
      } as unknown as IIngredient,
      'image',
    );

    expect(recipe.lighting).toBe('golden hour');
    expect(recipe.subject).toBe('a founder');
  });
});
