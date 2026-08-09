import AgentProfilePlatformOverrideWideFields from '@pages/brands/components/sidebar/AgentProfilePlatformOverrideWideFields';
import type {
  AgentProfilePlatformOverrideFormState,
  AgentProfilePlatformOverrideWideFieldsProps,
} from '@props/pages/brand-detail.props';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const onSave = vi.fn().mockResolvedValue(undefined);

const override: AgentProfilePlatformOverrideFormState = {
  approvedHooks: '',
  audience: '',
  bannedPhrases: '',
  canonicalSource: '',
  contentTypes: 'thread, reel',
  defaultModel: '',
  doNotSoundLike: '',
  exemplarTexts: 'a winning post',
  frequency: '',
  goals: '',
  messagingPillars: '',
  persona: 'a pragmatic builder',
  sampleOutput: 'a short example',
  style: '',
  tone: '',
  values: '',
  writingRules: 'lead with a claim',
};

function renderFields(
  overrides: Partial<AgentProfilePlatformOverrideWideFieldsProps> = {},
): void {
  const props: AgentProfilePlatformOverrideWideFieldsProps = {
    onSave,
    override,
    platformValue: 'linkedin',
    ...overrides,
  };

  render(<AgentProfilePlatformOverrideWideFields {...props} />);
}

describe('AgentProfilePlatformOverrideWideFields', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    onSave.mockResolvedValue(undefined);
  });

  it('renders each wide override field with its current value', () => {
    renderFields();

    expect(
      screen.getByRole('button', { name: 'linkedin Content Types Override' }),
    ).toHaveTextContent('thread, reel');
    expect(
      screen.getByRole('button', { name: 'linkedin Persona Override' }),
    ).toHaveTextContent('a pragmatic builder');
    expect(
      screen.getByRole('button', { name: 'linkedin Sample Output Override' }),
    ).toHaveTextContent('a short example');
  });

  it.each([
    ['Content Types', 'contentTypes', 'explainer'],
    ['Writing Rules', 'writingRules', 'cut fluff'],
    ['Persona', 'persona', 'a candid operator'],
    ['Sample Output', 'sampleOutput', 'another short example'],
    ['Exemplar Texts', 'exemplarTexts', 'another winning post'],
  ])(
    'saves the %s override with the platform and field name',
    async (label, field, nextValue) => {
      const user = userEvent.setup();
      renderFields();

      const ariaLabel = `linkedin ${label} Override`;
      await user.click(screen.getByRole('button', { name: ariaLabel }));
      const editor = screen.getByRole('textbox', { name: ariaLabel });
      await user.clear(editor);
      await user.type(editor, nextValue);
      await user.tab();

      await waitFor(() =>
        expect(onSave).toHaveBeenCalledWith('linkedin', field, nextValue),
      );
    },
  );

  it('disables the wide override fields when isDisabled is set', () => {
    renderFields({ isDisabled: true });

    expect(
      screen.getByRole('button', { name: 'linkedin Persona Override' }),
    ).toBeDisabled();
  });
});
