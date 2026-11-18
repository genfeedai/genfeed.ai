import { requireUiAction } from '@api-test/helpers/agent-ui-action';
import { describe, expect, it } from 'vitest';
import { proposePageChanges } from './agent-page-control-change.util';

describe('proposePageChanges', () => {
  it('turns the proposed changes into an approval card and changes nothing itself', () => {
    const result = proposePageChanges({
      changes: [
        { action: 'setChecked', label: 'Weekly recap', value: 'false' },
        { action: 'setValue', label: 'Display name', value: ' Ada ' },
      ],
      summary: 'Stop the weekly recap and rename the profile.',
    });

    expect(result.success).toBe(true);
    expect(result.creditsUsed).toBe(0);
    const card = requireUiAction(
      result.nextActions,
      'page_control_change_card',
    );
    expect(card.steps).toEqual([
      { action: 'setChecked', label: 'Weekly recap', value: false },
      { action: 'setValue', label: 'Display name', value: 'Ada' },
    ]);
    expect(card.description).toBe(
      'Stop the weekly recap and rename the profile.',
    );
    expect(card.title).toBe('Change 2 settings on this page');
  });

  it('reads "true" and "false" for a switch in any case', () => {
    const result = proposePageChanges({
      changes: [{ action: 'setChecked', label: 'Agent Emails', value: 'TRUE' }],
    });

    const card = requireUiAction(
      result.nextActions,
      'page_control_change_card',
    );
    expect(card.steps).toEqual([
      { action: 'setChecked', label: 'Agent Emails', value: true },
    ]);
    expect(card.title).toBe('Change a setting on this page');
  });

  it.each([
    ['no changes', { changes: [] }, 'at least one change'],
    [
      'a switch given text',
      {
        changes: [
          { action: 'setChecked', label: 'Agent Emails', value: 'yes' },
        ],
      },
      '"Agent Emails" is a switch or checkbox',
    ],
    [
      'an action the card cannot run',
      { changes: [{ action: 'press', label: 'Delete account', value: 'x' }] },
      'needs an action of setChecked or setValue',
    ],
    [
      'a missing name',
      { changes: [{ action: 'setValue', label: ' ', value: 'x' }] },
      'needs the control name',
    ],
  ])('refuses %s and shows no card', (_name, params, message) => {
    const result = proposePageChanges(params);

    expect(result.success).toBe(false);
    expect(result.error).toContain(message);
    expect(result.nextActions).toBeUndefined();
  });

  it('refuses more changes than one card can show', () => {
    const changes = Array.from({ length: 11 }, (_, index) => ({
      action: 'setChecked',
      label: `Switch ${index}`,
      value: 'true',
    }));

    const result = proposePageChanges({ changes });

    expect(result.success).toBe(false);
    expect(result.error).toContain('at most 10');
  });
});
