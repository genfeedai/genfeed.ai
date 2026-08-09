import AgentProfilePlatformOverrideFields from '@pages/brands/components/sidebar/AgentProfilePlatformOverrideFields';
import type {
  AgentProfilePlatformOverrideFieldsProps,
  AgentProfilePlatformOverrideFormState,
} from '@props/pages/brand-detail.props';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import userEvent from '@testing-library/user-event';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const onSave = vi.fn().mockResolvedValue(undefined);
const onSelectChange = vi.fn();

const override: AgentProfilePlatformOverrideFormState = {
  approvedHooks: 'the quiet part',
  audience: 'developers',
  bannedPhrases: 'clickbait',
  canonicalSource: '',
  contentTypes: 'thread',
  defaultModel: '',
  doNotSoundLike: 'jargon',
  exemplarTexts: 'a winning post',
  frequency: 'daily',
  goals: 'engagement',
  messagingPillars: 'clarity',
  persona: 'a pragmatic builder',
  sampleOutput: 'a short example',
  style: 'punchy',
  tone: 'wry',
  values: 'craft',
  writingRules: 'lead with a claim',
};

function renderFields(
  overrides: Partial<AgentProfilePlatformOverrideFieldsProps> = {},
): void {
  const props: AgentProfilePlatformOverrideFieldsProps = {
    enabledModelIds: ['openai/gpt-5.6-luna', 'anthropic/claude-opus-5'],
    onSave,
    onSelectChange,
    override,
    platformValue: 'twitter',
    ...overrides,
  };

  render(<AgentProfilePlatformOverrideFields {...props} />);
}

describe('AgentProfilePlatformOverrideFields', () => {
  beforeAll(() => {
    // Radix Select relies on pointer-capture and layout APIs jsdom omits.
    Element.prototype.hasPointerCapture = () => false;
    Element.prototype.setPointerCapture = () => undefined;
    Element.prototype.releasePointerCapture = () => undefined;
    Element.prototype.scrollIntoView = () => undefined;
  });

  beforeEach(() => {
    vi.clearAllMocks();
    onSave.mockResolvedValue(undefined);
  });

  it('renders the override fields prefixed with the platform value', () => {
    renderFields();

    expect(
      screen.getByRole('button', { name: 'twitter Tone Override' }),
    ).toHaveTextContent('wry');
    expect(
      screen.getByRole('button', { name: 'twitter Style Override' }),
    ).toHaveTextContent('punchy');
    expect(
      screen.getByRole('combobox', { name: /voice source override/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('combobox', { name: /model override/i }),
    ).toBeInTheDocument();
  });

  it.each([
    ['Tone', 'tone', 'deadpan'],
    ['Style', 'style', 'terse'],
    ['Frequency', 'frequency', 'weekly'],
    ['Audience', 'audience', 'operators'],
    ['Goals', 'goals', 'leads'],
    ['Messaging Pillars', 'messagingPillars', 'proof'],
    ['Approved Hooks', 'approvedHooks', 'most teams get this wrong'],
    ['Banned Phrases', 'bannedPhrases', 'synergy'],
    ['Avoid', 'doNotSoundLike', 'hype'],
  ])(
    'saves the %s override with the platform and field name',
    async (label, field, nextValue) => {
      const user = userEvent.setup();
      renderFields();

      const ariaLabel = `twitter ${label} Override`;
      await user.click(screen.getByRole('button', { name: ariaLabel }));
      const editor = screen.getByRole('textbox', { name: ariaLabel });
      await user.clear(editor);
      await user.type(editor, nextValue);
      await user.keyboard('{Enter}');

      await waitFor(() =>
        expect(onSave).toHaveBeenCalledWith('twitter', field, nextValue),
      );
    },
  );

  it('reports a canonical source override selection', async () => {
    const user = userEvent.setup();
    renderFields();

    await user.click(
      screen.getByRole('combobox', { name: /voice source override/i }),
    );
    await user.click(screen.getByRole('option', { name: 'Hybrid' }));

    await waitFor(() =>
      expect(onSelectChange).toHaveBeenCalledWith(
        'twitter',
        'canonicalSource',
        'hybrid',
      ),
    );
  });

  it('clears the model override back to an empty value when Auto is picked', async () => {
    const user = userEvent.setup();
    renderFields({
      override: { ...override, defaultModel: 'openai/gpt-5.6-luna' },
    });

    await user.click(screen.getByRole('combobox', { name: /model override/i }));
    await user.click(screen.getByRole('option', { name: 'Auto' }));

    await waitFor(() =>
      expect(onSelectChange).toHaveBeenCalledWith(
        'twitter',
        'defaultModel',
        '',
      ),
    );
  });

  it('lists the enabled model ids as model override options', async () => {
    const user = userEvent.setup();
    renderFields();

    await user.click(screen.getByRole('combobox', { name: /model override/i }));
    await user.click(
      screen.getByRole('option', { name: 'anthropic/claude-opus-5' }),
    );

    await waitFor(() =>
      expect(onSelectChange).toHaveBeenCalledWith(
        'twitter',
        'defaultModel',
        'anthropic/claude-opus-5',
      ),
    );
  });

  it('disables the override controls when isDisabled is set', () => {
    renderFields({ isDisabled: true });

    expect(
      screen.getByRole('button', { name: 'twitter Tone Override' }),
    ).toBeDisabled();
    expect(
      screen.getByRole('combobox', { name: /voice source override/i }),
    ).toBeDisabled();
  });
});
