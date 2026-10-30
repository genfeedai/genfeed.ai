import { describe, expect, it } from 'vitest';
import { FAQ_CATEGORIES, FAQ_ITEMS_CORE } from './faq.data';

describe('website FAQ catalog', () => {
  it('keeps unique questions across every category', () => {
    const questions = FAQ_CATEGORIES.flatMap((category) =>
      category.questions.map((item) => item.question),
    );

    expect(questions.length).toBeGreaterThan(0);
    expect(new Set(questions).size).toBe(questions.length);
    expect(
      FAQ_CATEGORIES.every((category) => category.questions.length > 0),
    ).toBe(true);
  });

  it('reuses the General answers on the home-page core preview', () => {
    const general = FAQ_CATEGORIES.find(
      (category) => category.category === 'General',
    );

    expect(general).toBeDefined();
    expect(FAQ_ITEMS_CORE.slice(0, general?.questions.length)).toEqual(
      general?.questions,
    );
    expect(FAQ_ITEMS_CORE.length).toBeGreaterThan(
      general?.questions.length ?? 0,
    );
  });

  it('answers every question with non-empty copy', () => {
    for (const category of FAQ_CATEGORIES) {
      for (const item of category.questions) {
        expect(item.question.trim().length).toBeGreaterThan(0);
        expect(item.answer.trim().length).toBeGreaterThan(0);
      }
    }
  });
});
