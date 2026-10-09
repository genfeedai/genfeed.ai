import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import ClipsInputForm from './ClipsInputForm';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

function renderForm(
  overrides: Partial<ComponentProps<typeof ClipsInputForm>> = {},
) {
  const props = {
    draftSaveState: 'idle' as const,
    error: null,
    generationMode: 'avatar' as const,
    isSubmitting: false,
    maxClips: 10,
    minViralityScore: 50,
    onAnalyze: vi.fn(),
    onModeChange: vi.fn(),
    onSetMaxClips: vi.fn(),
    onSetMinViralityScore: vi.fn(),
    onSetSourceFile: vi.fn(),
    onSetSourceKind: vi.fn(),
    onSetYoutubeUrl: vi.fn(),
    onStartQuick: vi.fn(),
    quickStartHint: 'Uses saved brand avatar and voice defaults.',
    sourceFile: null,
    sourceKind: 'youtube' as const,
    uploadProgress: 0,
    youtubeUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    ...overrides,
  };

  return {
    props,
    ...render(<ClipsInputForm {...props} />),
  };
}

describe('ClipsInputForm', () => {
  it('imports and transcribes from one explicit source-only action with a credit notice', () => {
    const { props } = renderForm({ sourceOnly: true });
    expect(
      screen.queryByRole('button', { name: /start clip factory/i }),
    ).toBeNull();
    expect(screen.queryByRole('button', { name: /AI Avatar/i })).toBeNull();
    expect(screen.queryByLabelText('Max clips')).toBeNull();
    expect(
      screen.getByText(
        'Uses credits to transcribe and find highlights. No avatar videos are generated.',
      ),
    ).toBeVisible();
    expect(props.onAnalyze).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole('button', { name: /import & transcribe/i }),
    );
    expect(props.onAnalyze).toHaveBeenCalledOnce();
    expect(props.onStartQuick).not.toHaveBeenCalled();
  });

  it('requires a source and prevents another import while submitting', () => {
    const { rerender, props } = renderForm({
      sourceOnly: true,
      youtubeUrl: '',
    });
    expect(
      screen.getByRole('button', { name: /import & transcribe/i }),
    ).toBeDisabled();
    rerender(
      <ClipsInputForm
        {...props}
        youtubeUrl="https://youtu.be/dQw4w9WgXcQ"
        isSubmitting
      />,
    );
    expect(
      screen.getByRole('button', { name: /importing source/i }),
    ).toBeDisabled();
  });

  it('starts the one-click clip factory from the primary action', () => {
    const { props } = renderForm();

    expect(screen.queryByText('AI Clip Factory')).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', { name: /start clip factory/i }),
    );

    expect(props.onStartQuick).toHaveBeenCalledTimes(1);
    expect(props.onAnalyze).not.toHaveBeenCalled();
  });

  it('keeps the highlight review path available as a secondary action', () => {
    const { props } = renderForm();

    fireEvent.click(
      screen.getByRole('button', { name: /review highlights first/i }),
    );

    expect(props.onAnalyze).toHaveBeenCalledTimes(1);
    expect(props.onStartQuick).not.toHaveBeenCalled();
  });

  it('shows the saved-defaults readiness hint', () => {
    renderForm({
      quickStartHint:
        'No saved HeyGen defaults. Review highlights first to enter IDs manually.',
    });

    expect(
      screen.getByText(
        'No saved HeyGen defaults. Review highlights first to enter IDs manually.',
      ),
    ).toBeInTheDocument();
  });

  it('lets the user select raw-cut before starting a project', () => {
    const { props } = renderForm();

    fireEvent.click(screen.getByRole('button', { name: /raw cut/i }));

    expect(props.onModeChange).toHaveBeenCalledWith('raw-cut');
  });

  it('switches to a long-form upload and accepts an audio file', () => {
    const { props } = renderForm();
    fireEvent.click(
      screen.getByRole('button', { name: /upload audio or video/i }),
    );
    expect(props.onSetSourceKind).toHaveBeenCalledWith('upload');

    const file = new File(['audio'], 'podcast.mp3', { type: 'audio/mpeg' });
    const { props: uploadProps } = renderForm({
      sourceKind: 'upload',
      youtubeUrl: '',
    });
    fireEvent.change(screen.getByLabelText('Audio or video file'), {
      target: { files: [file] },
    });
    expect(uploadProps.onSetSourceFile).toHaveBeenCalledWith(file);
  });

  it('asks for the restored upload file again by name', () => {
    renderForm({
      draftFilename: 'podcast.mp4',
      sourceKind: 'upload',
      youtubeUrl: '',
    });

    expect(
      screen.getByText(
        'Choose podcast.mp4 again to continue. Drafts keep the filename, not the file.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /start clip factory/i }),
    ).toBeDisabled();
  });

  it.each([
    ['saving', 'Saving draft…'],
    ['saved', 'Draft saved'],
    ['error', 'Draft not saved. Your changes are still on this page.'],
  ] as const)('announces the %s draft state', (draftSaveState, copy) => {
    renderForm({ draftSaveState });

    expect(screen.getByTestId('clips-draft-save-state')).toHaveTextContent(
      copy,
    );
  });

  it('stays quiet about drafts before the first autosave', () => {
    renderForm();

    expect(
      screen.queryByTestId('clips-draft-save-state'),
    ).not.toBeInTheDocument();
  });
});
