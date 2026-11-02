import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ClipperNewPaneContent from './ClipperNewPaneContent';

const mocks = vi.hoisted(() => ({
  analyze: vi.fn(),
  setGenerationMode: vi.fn(),
  setMaxClips: vi.fn(),
  setMinViralityScore: vi.fn(),
  setYoutubeUrl: vi.fn(),
}));

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@/../tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

vi.mock('../useStudioClipperPage', () => ({
  useStudioClipperPage: () => ({
    draftSaveState: 'idle',
    error: null,
    generationMode: 'raw-cut',
    handleAnalyze: mocks.analyze,
    handleStartFromYoutube: vi.fn(),
    isSubmitting: false,
    maxClips: 10,
    minViralityScore: 50,
    setGenerationMode: mocks.setGenerationMode,
    setMaxClips: mocks.setMaxClips,
    setMinViralityScore: mocks.setMinViralityScore,
    setSourceFile: vi.fn(),
    setSourceKind: vi.fn(),
    setYoutubeUrl: mocks.setYoutubeUrl,
    sourceFile: null,
    sourceKind: 'youtube',
    uploadProgress: 0,
    youtubeUrl: 'https://youtu.be/dQw4w9WgXcQ',
  }),
}));

describe('ClipperNewPane', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('opens on the clip styles and the source bar without importing anything', () => {
    render(<ClipperNewPaneContent />);

    expect(
      screen.getByRole('heading', { name: 'What should Clipper cut?' }),
    ).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Podcast highlights' }),
    ).toBeVisible();
    expect(screen.getByLabelText('YouTube URL')).toBeVisible();
    expect(mocks.analyze).not.toHaveBeenCalled();
  });

  it('applies a style to the clip settings without starting an import', () => {
    render(<ClipperNewPaneContent />);

    fireEvent.click(screen.getByRole('button', { name: 'Podcast highlights' }));

    expect(mocks.setGenerationMode).toHaveBeenCalledWith('raw-cut');
    expect(mocks.setMaxClips).toHaveBeenCalledWith(8);
    expect(mocks.setMinViralityScore).toHaveBeenCalledWith(70);
    expect(screen.getByRole('status')).toHaveTextContent(
      'Podcast highlights preset applied: up to 8 clips scoring 70 or higher.',
    );
    expect(mocks.analyze).not.toHaveBeenCalled();
    expect(screen.getByLabelText('YouTube URL')).toHaveValue(
      'https://youtu.be/dQw4w9WgXcQ',
    );
    expect(
      screen.getByRole('button', { name: 'Import & transcribe' }),
    ).toBeEnabled();
  });

  it('imports the source from the send button', () => {
    render(<ClipperNewPaneContent />);

    fireEvent.click(
      screen.getByRole('button', { name: 'Import & transcribe' }),
    );

    expect(mocks.analyze).toHaveBeenCalledTimes(1);
  });
});
