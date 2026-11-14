import { describe, expect, it } from 'vitest';
import { findCardProblems, loadQaCards, parseQaCards } from './cards';

const TEXT_CARD = {
  brandFixtureId: 'synthetic-kelder',
  contentKind: 'social-post',
  fixtureRef: 'smoke:smoke-social-post-1',
  id: 'qa-text-x',
  medium: 'text',
  publish: false,
  requiredProof: ['receipt'],
  surface: 'agent-chat',
  taskPrompt:
    "Write a post announcing KELDER's 26 cm pre-seasoned cast-iron skillet.",
};

describe('QA task cards', () => {
  it('match the fixtures they point at, with brand context kept out of the prompt', async () => {
    expect(await findCardProblems(loadQaCards())).toEqual([]);
  });

  it('cover eight text kinds and four image tasks, none of which publish', () => {
    const cards = loadQaCards();
    expect(cards.filter((card) => card.medium === 'text')).toHaveLength(8);
    expect(cards.filter((card) => card.medium === 'image')).toHaveLength(4);
    expect(cards.every((card) => card.publish === false)).toBe(true);
  });

  it('reports a prompt that drifted from its fixture row', async () => {
    const [card] = parseQaCards(
      JSON.stringify({ ...TEXT_CARD, taskPrompt: 'Write a post about pans.' }),
    );
    expect(await findCardProblems([card])).toEqual([
      'qa-text-x: taskPrompt differs from smoke:smoke-social-post-1',
    ]);
  });

  it('reports a card whose fixture row does not exist', async () => {
    const [card] = parseQaCards(
      JSON.stringify({ ...TEXT_CARD, fixtureRef: 'smoke:missing-row' }),
    );
    expect(await findCardProblems([card])).toEqual([
      'qa-text-x: no smoke row "missing-row"',
    ]);
  });

  it('reports a prompt that carries a banned phrase', async () => {
    const prompt = 'Write a revolutionary post about the skillet.';
    const [card] = parseQaCards(
      JSON.stringify({ ...TEXT_CARD, taskPrompt: prompt }),
    );
    expect(await findCardProblems([card])).toContain(
      'qa-text-x: taskPrompt contains banned "revolutionary"',
    );
  });

  it('accepts a standalone card with no fixture to drift from', async () => {
    const { fixtureRef: _unused, ...standalone } = TEXT_CARD;
    const cards = parseQaCards(
      JSON.stringify({
        ...standalone,
        brandFixtureId: 'genfeed-review',
        id: 'qa-genfeed-post',
        taskPrompt: 'Write a post about connecting your agent to Genfeed.',
      }),
    );
    expect(cards[0].fixtureRef).toBeUndefined();
    expect(await findCardProblems(cards)).toEqual([]);
  });

  it('rejects a repeated card id', () => {
    const line = JSON.stringify(TEXT_CARD);
    expect(() => parseQaCards(`${line}\n${line}`)).toThrow(
      'Repeated card id "qa-text-x"',
    );
  });

  it('rejects a card that would publish', () => {
    expect(() =>
      parseQaCards(JSON.stringify({ ...TEXT_CARD, publish: true })),
    ).toThrow('publish');
  });
});
