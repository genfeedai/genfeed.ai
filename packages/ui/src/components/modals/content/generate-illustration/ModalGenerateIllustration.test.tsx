import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { PropsWithChildren } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import ModalGenerateIllustration from '@ui/modals/content/generate-illustration/ModalGenerateIllustration';

const handleGenerate = vi.fn();
const handleClose = vi.fn();
const handleConfirmImage = vi.fn();
const handleTryAgain = vi.fn();

const hookState = {
  prompt: 'test prompt',
  setPrompt: vi.fn(),
  isGenerating: false,
  error: null as string | null,
  generatedImageId: null as string | null,
  generatedImageUrl: null as string | null,
  textareaRef: { current: null },
  formatLabel: 'Square',
  dimensions: { width: 1024, height: 1024 },
  handleGenerate,
  handleKeyDown: vi.fn(),
  handleClose,
  handleConfirmImage,
  handleTryAgain,
};

vi.mock('./useModalGenerateIllustration', () => ({
  useModalGenerateIllustration: () => hookState,
}));

vi.mock('@ui/modals/modal/Modal', () => ({
  default: ({
    children,
    title,
    error,
  }: PropsWithChildren<{ title?: string; error?: string | null }>) => (
    <div data-testid="modal">
      <h2>{title}</h2>
      {error ? <p>{error}</p> : null}
      {children}
    </div>
  ),
}));

vi.mock('./IllustrationPromptSection', () => ({
  default: ({ prompt }: { prompt: string }) => (
    <div data-testid="illustration-prompt">{prompt}</div>
  ),
}));

vi.mock('./IllustrationPreview', () => ({
  default: () => <div data-testid="illustration-preview" />,
}));

vi.mock('./IllustrationActions', () => ({
  default: ({
    generatedImageId,
    onGenerate,
    onConfirmImage,
    onTryAgain,
    onClose,
  }: {
    generatedImageId: string | null;
    onGenerate: () => void;
    onConfirmImage: () => void;
    onTryAgain: () => void;
    onClose: () => void;
  }) => (
    <div data-testid="illustration-actions">
      {generatedImageId ? (
        <>
          <button type="button" onClick={onTryAgain}>
            Try Again
          </button>
          <button type="button" onClick={onConfirmImage}>
            Use This Image
          </button>
        </>
      ) : (
        <>
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button type="button" onClick={onGenerate}>
            Generate
          </button>
        </>
      )}
    </div>
  ),
}));

describe('ModalGenerateIllustration', () => {
  beforeEach(() => {
    hookState.prompt = 'test prompt';
    hookState.error = null;
    hookState.generatedImageId = null;
    hookState.generatedImageUrl = null;
    handleGenerate.mockClear();
    handleClose.mockClear();
    handleConfirmImage.mockClear();
    handleTryAgain.mockClear();
  });

  it('should render without crashing', () => {
    expect(() =>
      render(
        <ModalGenerateIllustration
          isOpen
          initialPrompt="test prompt"
          onConfirm={() => undefined}
        />,
      ),
    ).not.toThrow();
  });

  it('generates from the prompt and confirms a finished image', async () => {
    const user = userEvent.setup();

    const { rerender } = render(
      <ModalGenerateIllustration
        isOpen
        initialPrompt="test prompt"
        onConfirm={() => undefined}
      />,
    );

    expect(screen.getByText('Generate Illustration')).toBeInTheDocument();
    expect(screen.getByTestId('illustration-prompt')).toHaveTextContent(
      'test prompt',
    );
    expect(screen.queryByTestId('illustration-preview')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Generate' }));
    expect(handleGenerate).toHaveBeenCalledTimes(1);

    hookState.generatedImageId = 'img-1';
    hookState.generatedImageUrl = 'https://cdn.test/img-1.png';
    rerender(
      <ModalGenerateIllustration
        isOpen
        initialPrompt="test prompt"
        onConfirm={() => undefined}
      />,
    );

    expect(screen.getByTestId('illustration-preview')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Use This Image' }));
    expect(handleConfirmImage).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: 'Try Again' }));
    expect(handleTryAgain).toHaveBeenCalledTimes(1);
  });

  it('surfaces hook errors on the modal', () => {
    hookState.generatedImageId = null;
    hookState.generatedImageUrl = null;
    hookState.error = 'Provider timed out';

    render(
      <ModalGenerateIllustration
        isOpen
        initialPrompt="test prompt"
        onConfirm={() => undefined}
      />,
    );

    expect(screen.getByText('Provider timed out')).toBeInTheDocument();
  });
});
