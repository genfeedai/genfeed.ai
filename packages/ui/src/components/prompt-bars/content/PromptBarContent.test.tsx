import '@testing-library/jest-dom/vitest';
import { Platform } from '@genfeedai/enums';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import PromptBarContent from '@ui/prompt-bars/content/PromptBarContent';
import { afterEach, describe, expect, it, vi } from 'vitest';

const PRESET = {
  description: 'Rewrite this section clearly',
  key: 'preset.text.content.test',
  label: 'Content Preset',
};

/** The article surface: enhancement only, no post-generation controls. */
const articleProps = {
  isEnhancing: false,
  onSubmit: vi.fn(),
};

/** The posts surface: generation with count, platform and thread controls. */
const postProps = {
  isEnhancing: false,
  onSubmit: vi.fn(),
  showCountDropdown: true,
  showThreadToggle: true,
  buttonLabel: 'Generate',
};

function typePrompt(value: string): void {
  fireEvent.change(screen.getByRole('textbox'), { target: { value } });
}

describe('PromptBarContent', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('uses the shared composer shell and body', () => {
    render(<PromptBarContent {...articleProps} />);

    expect(screen.getByTestId('prompt-bar-composer')).toBeInTheDocument();
    expect(screen.getByTestId('prompt-bar-body')).toBeInTheDocument();
  });

  it('renders the enhancement placeholder for surfaces without generation', () => {
    render(<PromptBarContent {...articleProps} />);

    expect(
      screen.getByPlaceholderText(/enhance your content/i),
    ).toBeInTheDocument();
  });

  it('renders a platform-aware placeholder for generation surfaces', () => {
    render(<PromptBarContent {...postProps} platform={Platform.TWITTER} />);

    expect(
      screen.getByPlaceholderText(/viral tweet ideas/i),
    ).toBeInTheDocument();
  });

  it('prefers an explicit placeholder override', () => {
    render(<PromptBarContent {...articleProps} placeholder="Say something" />);

    expect(screen.getByPlaceholderText('Say something')).toBeInTheDocument();
  });

  it('fills the prompt when a preset is selected', () => {
    render(<PromptBarContent {...articleProps} presets={[PRESET]} />);

    fireEvent.click(screen.getByRole('button', { name: /preset/i }));
    fireEvent.click(screen.getByText('Content Preset'));

    expect(screen.getByPlaceholderText(/enhance your content/i)).toHaveValue(
      PRESET.description,
    );
  });

  it('submits the trimmed prompt with no post options on the article surface', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<PromptBarContent {...articleProps} onSubmit={onSubmit} />);

    typePrompt('  Make it punchier  ');
    fireEvent.click(screen.getByRole('button', { name: /enhance/i }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        'Make it punchier',
        undefined,
        undefined,
        undefined,
      );
    });
  });

  it('forwards count, platform and thread state on the posts surface', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(
      <PromptBarContent
        {...postProps}
        onSubmit={onSubmit}
        platform={Platform.TWITTER}
      />,
    );

    typePrompt('Launch week ideas');
    fireEvent.click(screen.getByRole('button', { name: /generate/i }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        'Launch week ideas',
        3,
        Platform.TWITTER,
        false,
      );
    });
  });

  it('forwards thread mode once the thread toggle is enabled', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(
      <PromptBarContent
        {...postProps}
        onSubmit={onSubmit}
        platform={Platform.TWITTER}
      />,
    );

    typePrompt('Launch week ideas');
    fireEvent.click(screen.getByRole('button', { name: /thread/i }));
    fireEvent.click(screen.getByRole('button', { name: /generate/i }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        'Launch week ideas',
        3,
        Platform.TWITTER,
        true,
      );
    });
  });

  it('clears the prompt after a successful submit', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<PromptBarContent {...articleProps} onSubmit={onSubmit} />);

    typePrompt('Make it punchier');
    fireEvent.click(screen.getByRole('button', { name: /enhance/i }));

    await waitFor(() => {
      expect(screen.getByRole('textbox')).toHaveValue('');
    });
  });

  it('keeps the prompt when submission fails', async () => {
    const onSubmit = vi.fn().mockRejectedValue(new Error('nope'));
    render(<PromptBarContent {...articleProps} onSubmit={onSubmit} />);

    typePrompt('Make it punchier');
    fireEvent.click(screen.getByRole('button', { name: /enhance/i }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalled();
    });
    expect(screen.getByRole('textbox')).toHaveValue('Make it punchier');
  });

  it('submits on Enter and stays put on Shift+Enter', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<PromptBarContent {...articleProps} onSubmit={onSubmit} />);

    typePrompt('Make it punchier');
    fireEvent.keyDown(screen.getByRole('textbox'), {
      key: 'Enter',
      shiftKey: true,
    });
    expect(onSubmit).not.toHaveBeenCalled();

    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' });
    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        'Make it punchier',
        undefined,
        undefined,
        undefined,
      );
    });
  });

  it('locks the prompt and submit while an enhancement is in flight', () => {
    const onSubmit = vi.fn();
    render(
      <PromptBarContent
        {...articleProps}
        isEnhancing={true}
        onSubmit={onSubmit}
      />,
    );

    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' });

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole('textbox')).toBeDisabled();
    expect(screen.getByRole('button', { name: /enhance/i })).toBeDisabled();
  });

  it('swaps the textarea for a single-line input when collapsed', () => {
    render(<PromptBarContent {...articleProps} />);

    expect(screen.getByRole('textbox').tagName).toBe('TEXTAREA');

    fireEvent.click(screen.getByRole('button', { name: /collapse/i }));

    expect(screen.getByRole('textbox').tagName).toBe('INPUT');
  });

  it('uses semantic chrome in expanded and collapsed modes', () => {
    const { container } = render(
      <PromptBarContent
        {...postProps}
        platform={Platform.TWITTER}
        presets={[PRESET]}
      />,
    );

    const expandedInput = screen.getByRole('textbox');
    expect(expandedInput).toHaveClass('border-border', 'text-foreground');
    expect(container.innerHTML).not.toMatch(
      /\b(?:bg|border|ring|text)-(?:black|white)(?:\b|\/|\[)/,
    );

    fireEvent.click(screen.getByRole('button', { name: /collapse/i }));

    const collapsedInput = screen.getByRole('textbox');
    expect(collapsedInput).toHaveClass(
      'border-border',
      'bg-background-tertiary',
      'text-foreground',
    );
    expect(container.innerHTML).not.toMatch(
      /\b(?:bg|border|ring|text)-(?:black|white)(?:\b|\/|\[)/,
    );
  });
});
