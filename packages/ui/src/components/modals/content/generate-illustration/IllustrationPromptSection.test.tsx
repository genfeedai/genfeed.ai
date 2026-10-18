import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import IllustrationPromptSection from '@ui/modals/content/generate-illustration/IllustrationPromptSection';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@ui/tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

// The TipTap editor needs a real DOM layout; a textarea keeps these tests on
// the section's own behaviour.
vi.mock('@ui/prompt-editor/PromptEditor', () => ({
  default: ({
    ariaLabel,
    placeholder,
    value,
    isDisabled,
    onValueChange,
    onSubmit,
  }: {
    ariaLabel?: string;
    placeholder?: string;
    value?: string;
    isDisabled?: boolean;
    onValueChange?: (value: string) => void;
    onSubmit?: () => void;
  }) => (
    <textarea
      aria-label={ariaLabel}
      placeholder={placeholder}
      value={value}
      disabled={isDisabled}
      onChange={(event) => onValueChange?.(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          onSubmit?.();
        }
      }}
    />
  ),
}));

function renderSection(
  overrides: Partial<Parameters<typeof IllustrationPromptSection>[0]> = {},
) {
  const props = {
    formatLabel: 'Square (1:1)',
    hasGeneratedImage: false,
    isGenerating: false,
    onGenerate: vi.fn(),
    onPromptChange: vi.fn(),
    prompt: 'A fox in a forest',
    ...overrides,
  };
  return { ...render(<IllustrationPromptSection {...props} />), props };
}

describe('IllustrationPromptSection', () => {
  it('shows the prompt with its target format', () => {
    renderSection();

    expect(screen.getByLabelText('Describe your illustration')).toHaveValue(
      'A fox in a forest',
    );
    expect(screen.getByText('Square (1:1)')).toBeInTheDocument();
  });

  it('generates from the send button and from Enter', async () => {
    const user = userEvent.setup();
    const { props } = renderSection();

    await user.click(screen.getByRole('button', { name: 'Generate' }));
    await user.type(
      screen.getByLabelText('Describe your illustration'),
      '{Enter}',
    );

    expect(props.onGenerate).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['the prompt is blank', { prompt: '   ' }],
    ['an image is already waiting', { hasGeneratedImage: true }],
    ['a generation is running', { isGenerating: true }],
  ])('does not generate when %s', async (_name, overrides) => {
    const user = userEvent.setup();
    const { props } = renderSection(overrides);

    expect(screen.getByRole('button', { name: 'Generate' })).toBeDisabled();
    await user.type(
      screen.getByLabelText('Describe your illustration'),
      '{Enter}',
      { skipClick: true },
    );
    expect(props.onGenerate).not.toHaveBeenCalled();
  });

  it('reports prompt edits and shows progress while generating', async () => {
    const user = userEvent.setup();
    const { props, rerender } = renderSection({ prompt: '' });

    await user.type(screen.getByLabelText('Describe your illustration'), 'x');
    expect(props.onPromptChange).toHaveBeenCalledWith('x');

    rerender(<IllustrationPromptSection {...props} isGenerating />);
    expect(screen.getByText('Generating your illustration…')).toBeVisible();
  });
});
