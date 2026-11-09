import { describe, expect, it } from 'vitest';
import {
  INITIAL_CHARACTER_SHEET_WIZARD as initial,
  characterSheetWizardReducer as reduce,
} from './character-sheet-wizard';

const sheet = { id: 'sheet-1', url: 'https://cdn.test/sheet-1.png' };

describe('characterSheetWizardReducer', () => {
  it('shows the generated sheet for review', () => {
    const generated = reduce(reduce(initial, { type: 'generate_started' }), {
      candidate: sheet,
      type: 'generate_succeeded',
    });

    expect(generated).toEqual({
      candidate: sheet,
      isCreating: false,
      isGenerating: false,
      step: 'candidate',
    });
  });

  it('stays on describe when generation fails', () => {
    expect(
      reduce(reduce(initial, { type: 'generate_started' }), {
        type: 'generate_failed',
      }),
    ).toEqual(initial);
  });

  it('approves only a generated sheet', () => {
    const candidate = reduce(initial, {
      candidate: sheet,
      type: 'generate_succeeded',
    });

    expect(reduce(initial, { type: 'approved' })).toBe(initial);
    expect(reduce(candidate, { type: 'approved' }).step).toBe('approve');
  });

  it('returns to describe when the sheet is discarded', () => {
    const approving = reduce(
      reduce(initial, { candidate: sheet, type: 'generate_succeeded' }),
      { type: 'approved' },
    );

    expect(reduce(approving, { type: 'discarded' })).toEqual(initial);
  });

  it('marks creation in flight until it settles', () => {
    const creating = reduce(initial, { type: 'create_started' });

    expect(creating.isCreating).toBe(true);
    expect(reduce(creating, { type: 'create_settled' }).isCreating).toBe(false);
  });
});
