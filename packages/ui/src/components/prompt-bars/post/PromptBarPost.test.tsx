import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import PromptBarPost from '@ui/prompt-bars/post/PromptBarPost';
import { afterEach, describe, expect, it, vi } from 'vitest';

describe('PromptBarPost', () => {
  const baseProps = {
    isEnhancing: false,
    onSubmit: vi.fn(),
  };

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should render without crashing', () => {
    const { container } = render(<PromptBarPost {...baseProps} />);
    expect(container.firstChild).toBeInTheDocument();
    expect(container.firstChild).toHaveClass('rounded-3xl');
  });

  it('fills prompt when a preset is selected', () => {
    render(
      <PromptBarPost
        {...baseProps}
        presets={[
          {
            description: 'Sample preset prompt',
            key: 'preset.text.post.test',
            label: 'Test Preset',
          },
        ]}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /preset/i }));
    fireEvent.click(screen.getByText('Test Preset'));

    const textarea = screen.getByPlaceholderText(/enhance your post/i);
    expect((textarea as HTMLTextAreaElement).value).toBe(
      'Sample preset prompt',
    );
  });
});
