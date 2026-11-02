import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ClipperNewPaneContent from './ClipperNewPaneContent';

// What the pane did to the Clipper form, kept as plain values the tests read
// back: the clip settings it wrote and how many imports it started.
const form = vi.hoisted(() => ({
  imports: 0,
  settings: {} as Record<string, number | string>,
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
    handleAnalyze: () => {
      form.imports += 1;
    },
    handleStartFromYoutube: vi.fn(),
    isSubmitting: false,
    maxClips: 10,
    minViralityScore: 50,
    setGenerationMode: (value: string) => {
      form.settings.generationMode = value;
    },
    setMaxClips: (value: number) => {
      form.settings.maxClips = value;
    },
    setMinViralityScore: (value: number) => {
      form.settings.minViralityScore = value;
    },
    setSourceFile: vi.fn(),
    setSourceKind: vi.fn(),
    setYoutubeUrl: () => undefined,
    sourceFile: null,
    sourceKind: 'youtube',
    uploadProgress: 0,
    youtubeUrl: 'https://youtu.be/dQw4w9WgXcQ',
  }),
}));

describe('ClipperNewPane', () => {
  beforeEach(() => {
    form.imports = 0;
    form.settings = {};
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
    expect(form.imports).toBe(0);
  });

  it('applies a style to the clip settings without starting an import', () => {
    render(<ClipperNewPaneContent />);

    fireEvent.click(screen.getByRole('button', { name: 'Podcast highlights' }));

    expect(form.settings).toEqual({
      generationMode: 'raw-cut',
      maxClips: 8,
      minViralityScore: 70,
    });
    expect(screen.getByRole('status')).toHaveTextContent(
      'Podcast highlights preset applied: up to 8 clips scoring 70 or higher.',
    );
    expect(form.imports).toBe(0);
  });

  it('imports the source from the send button', () => {
    render(<ClipperNewPaneContent />);

    fireEvent.click(
      screen.getByRole('button', { name: 'Import & transcribe' }),
    );

    expect(form.imports).toBe(1);
  });
});
