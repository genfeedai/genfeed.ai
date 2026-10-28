import { IngredientSerializer } from '@serializers/server/ingredients/ingredient.serializer';
import { describe, expect, it } from 'vitest';

const PROMPT = {
  action: 'turns toward the window',
  id: 'prompt-1',
  lighting: 'soft window light',
  original: 'A founder at a desk',
  renderedPrompt: 'A founder at a desk, turns toward the window.',
  renderTarget: 'prose',
  sounds: ['rain'],
  subject: 'a founder',
};

describe('ingredient prompt slots transport', () => {
  it('sends the prompt row slots and the sent text with a generation', () => {
    const response = IngredientSerializer.serialize({
      category: 'image',
      id: 'ingredient-1',
      prompt: PROMPT,
    }) as {
      included?: Array<{ attributes: Record<string, unknown>; type: string }>;
    };

    const prompt = response.included?.find((entry) => entry.type === 'prompt');
    expect(prompt?.attributes).toMatchObject({
      action: PROMPT.action,
      lighting: PROMPT.lighting,
      original: PROMPT.original,
      renderedPrompt: PROMPT.renderedPrompt,
      renderTarget: 'prose',
      sounds: ['rain'],
      subject: PROMPT.subject,
    });
  });
});
