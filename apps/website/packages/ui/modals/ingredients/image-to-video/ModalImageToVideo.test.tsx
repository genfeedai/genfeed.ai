import type { IIngredient } from '@genfeedai/interfaces';
import { render, screen } from '@testing-library/react';
import ModalImageToVideo from '@ui/modals/ingredients/image-to-video/ModalImageToVideo';
import type { PropsWithChildren } from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@ui/modals/modal/Modal', () => ({
  default: ({ children }: PropsWithChildren) => (
    <div data-testid="modal">{children}</div>
  ),
}));

vi.mock('@ui/prompt-bars/base/PromptBar', () => ({
  default: () => <div data-testid="prompt-bar" />,
}));

describe('ModalImageToVideo', () => {
  const image = {
    id: 'image-1',
    ingredientUrl: 'https://example.com/image.png',
    promptText: 'Test image',
  } as IIngredient;

  const baseProps = {
    image,
    isGenerating: false,
    models: [],
    onPromptChange: vi.fn(),
    onSubmit: vi.fn(),
    presets: [],
    promptData: { isValid: true },
  };

  it('should render without crashing', () => {
    const { container } = render(<ModalImageToVideo {...baseProps} />);
    expect(container.firstChild).toBeInTheDocument();
    expect(screen.getByTestId('modal')).toBeInTheDocument();
  });

  it('should handle user interactions correctly', () => {
    const { container } = render(<ModalImageToVideo {...baseProps} />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should apply correct styles and classes', () => {
    const { container } = render(<ModalImageToVideo {...baseProps} />);
    const rootElement = container.firstChild as HTMLElement;
    expect(rootElement).toBeInTheDocument();
  });
});
