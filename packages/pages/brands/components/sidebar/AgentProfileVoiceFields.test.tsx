import AgentProfileVoiceFields from '@pages/brands/components/sidebar/AgentProfileVoiceFields';
import type { AgentProfileVoiceFieldsProps } from '@props/pages/brand-detail.props';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import userEvent from '@testing-library/user-event';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const onCanonicalSourceChange = vi.fn();
const onFieldSave = vi.fn().mockResolvedValue(undefined);

function renderFields(
  overrides: Partial<AgentProfileVoiceFieldsProps> = {},
): void {
  const props: AgentProfileVoiceFieldsProps = {
    onCanonicalSourceChange,
    onFieldSave,
    voiceApprovedHooks: 'say the quiet part',
    voiceAudience: 'founders',
    voiceBannedPhrases: 'game-changing',
    voiceCanonicalSource: 'brand',
    voiceDoNotSoundLike: 'hype',
    voiceExemplarTexts: 'we ship systems',
    voiceMessagingPillars: 'clarity',
    voiceSampleOutput: 'a sharp post',
    voiceStyle: 'direct',
    voiceTone: 'steady',
    voiceValues: 'honesty',
    voiceWritingRules: 'lead with a claim',
    ...overrides,
  };

  render(<AgentProfileVoiceFields {...props} />);
}

async function commitInlineField(
  ariaLabel: string,
  nextValue: string,
): Promise<void> {
  const user = userEvent.setup();

  await user.click(screen.getByRole('button', { name: ariaLabel }));
  const editor = screen.getByRole('textbox', { name: ariaLabel });
  await user.clear(editor);
  await user.type(editor, nextValue);
  await user.keyboard('{Enter}');
}

describe('AgentProfileVoiceFields', () => {
  beforeAll(() => {
    // Radix Select relies on pointer-capture and layout APIs jsdom omits.
    Element.prototype.hasPointerCapture = () => false;
    Element.prototype.setPointerCapture = () => undefined;
    Element.prototype.releasePointerCapture = () => undefined;
    Element.prototype.scrollIntoView = () => undefined;
  });

  beforeEach(() => {
    vi.clearAllMocks();
    onFieldSave.mockResolvedValue(undefined);
  });

  it('renders every voice field with its current value', () => {
    renderFields();

    expect(screen.getByRole('button', { name: 'Tone' })).toHaveTextContent(
      'steady',
    );
    expect(screen.getByRole('button', { name: 'Style' })).toHaveTextContent(
      'direct',
    );
    expect(screen.getByRole('button', { name: 'Audience' })).toHaveTextContent(
      'founders',
    );
    expect(screen.getByRole('button', { name: 'Values' })).toHaveTextContent(
      'honesty',
    );
    expect(
      screen.getByRole('button', { name: 'Sample Output' }),
    ).toHaveTextContent('a sharp post');
    expect(
      screen.getByRole('combobox', { name: /canonical voice source/i }),
    ).toBeInTheDocument();
  });

  it.each([
    ['Tone', 'voiceTone', 'bold'],
    ['Style', 'voiceStyle', 'concise'],
    ['Audience', 'voiceAudience', 'operators'],
    ['Values', 'voiceValues', 'speed'],
    ['Messaging Pillars', 'voiceMessagingPillars', 'proof'],
    ['Do Not Sound Like', 'voiceDoNotSoundLike', 'jargon'],
    ['Approved Hooks', 'voiceApprovedHooks', 'most teams get this wrong'],
    ['Banned Phrases', 'voiceBannedPhrases', 'unlock your potential'],
    ['Writing Rules', 'voiceWritingRules', 'cut fluff'],
  ])(
    'saves the %s field through onFieldSave',
    async (ariaLabel, field, nextValue) => {
      renderFields();

      await commitInlineField(ariaLabel, nextValue);

      await waitFor(() =>
        expect(onFieldSave).toHaveBeenCalledWith(field, nextValue),
      );
    },
  );

  it.each([
    ['Exemplar Texts', 'voiceExemplarTexts', 'a winning post'],
    ['Sample Output', 'voiceSampleOutput', 'a representative example'],
  ])(
    'saves the multiline %s field through onFieldSave',
    async (ariaLabel, field, nextValue) => {
      const user = userEvent.setup();
      renderFields();

      await user.click(screen.getByRole('button', { name: ariaLabel }));
      const editor = screen.getByRole('textbox', { name: ariaLabel });
      await user.clear(editor);
      await user.type(editor, nextValue);
      await user.tab();

      await waitFor(() =>
        expect(onFieldSave).toHaveBeenCalledWith(field, nextValue),
      );
    },
  );

  it('disables every control when isDisabled is set', () => {
    renderFields({ isDisabled: true });

    expect(screen.getByRole('button', { name: 'Tone' })).toBeDisabled();
    expect(
      screen.getByRole('combobox', { name: /canonical voice source/i }),
    ).toBeDisabled();
  });

  it('reports canonical source changes from the select', async () => {
    const user = userEvent.setup();
    renderFields();

    await user.click(
      screen.getByRole('combobox', { name: /canonical voice source/i }),
    );
    await user.click(screen.getByRole('option', { name: 'Founder' }));

    await waitFor(() =>
      expect(onCanonicalSourceChange).toHaveBeenCalledWith('founder'),
    );
  });
});
