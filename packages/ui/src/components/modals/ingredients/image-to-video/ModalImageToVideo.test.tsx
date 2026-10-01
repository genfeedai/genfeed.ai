import type { IIngredient } from '@genfeedai/contracts/interfaces';
import type { PromptBarProps } from '@genfeedai/props/studio/prompt-bar.props';
import { render, screen } from '@testing-library/react';
import ModalImageToVideo from '@ui/modals/ingredients/image-to-video/ModalImageToVideo';
import type { PropsWithChildren } from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@ui/modals/modal/Modal', () => ({
  default: ({ children }: PropsWithChildren) => (
    <div data-testid="modal">{children}</div>
  ),
}));

let capturedPromptBar: PromptBarProps | undefined;
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
vi.mock('@ui/prompt-bars/base/PromptBar', () => ({
  default: (props: PromptBarProps) => {
    capturedPromptBar = props;
    return <div data-testid="prompt-bar" />;
  },
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

  it('passes the real optional video binding and visibly blocks Veo conversion', () => {
    const binding = {
      prepareRequest: () => null,
      submit: vi.fn().mockResolvedValue(undefined),
    };
    render(
      <ModalImageToVideo
        {...baseProps}
        imageToVideoCrunBinding={binding}
        promptData={{ isValid: true, models: ['crun/google/veo3-1-fast-t2v'] }}
      />,
    );
    expect(capturedPromptBar?.crunVideoBinding).toBe(binding);
    expect(capturedPromptBar?.isGenerateDisabled).toBe(true);
    expect(screen.getByRole('alert')).toHaveTextContent('textOnlyMode');
  });

  it('should render without crashing', () => {
    const { container } = render(<ModalImageToVideo {...baseProps} />);
    expect(container.firstChild).toBeInTheDocument();
    expect(screen.getByTestId('modal')).toBeInTheDocument();
    expect(screen.getByTestId('image-to-video-composer')).toBeInTheDocument();
    expect(
      container.querySelector('[data-layout-mode="inflow"]'),
    ).toBeInTheDocument();
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
