import { fireEvent, render, screen } from '@testing-library/react';
import PromptBarArticle from '@ui/prompt-bars/article/PromptBarArticle';
import { afterEach, describe, expect, it, vi } from 'vitest';

describe('PromptBarArticle', () => {
  const baseProps = {
    isEnhancing: false,
    onSubmit: vi.fn(),
  };

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should render without crashing', () => {
    const { container } = render(<PromptBarArticle {...baseProps} />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('fills prompt when a preset is selected', () => {
    render(
      <PromptBarArticle
        {...baseProps}
        presets={[
          {
            description: 'Rewrite this section clearly',
            key: 'preset.text.article.test',
            label: 'Article Preset',
          },
        ]}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /preset/i }));
    fireEvent.click(screen.getByText('Article Preset'));

    const textarea = screen.getByPlaceholderText(/enhance your content/i);
    expect((textarea as HTMLTextAreaElement).value).toBe(
      'Rewrite this section clearly',
    );
  });
});
