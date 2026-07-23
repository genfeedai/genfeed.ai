import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import ClipsInputForm from './ClipsInputForm';

function renderForm(
  overrides: Partial<ComponentProps<typeof ClipsInputForm>> = {},
) {
  const props = {
    error: null,
    generationMode: 'avatar' as const,
    isSubmitting: false,
    maxClips: 10,
    minViralityScore: 50,
    onAnalyze: vi.fn(),
    onModeChange: vi.fn(),
    onSetMaxClips: vi.fn(),
    onSetMinViralityScore: vi.fn(),
    onSetYoutubeUrl: vi.fn(),
    onStartQuick: vi.fn(),
    quickStartHint: 'Uses saved brand avatar and voice defaults.',
    youtubeUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    ...overrides,
  };

  return {
    props,
    ...render(<ClipsInputForm {...props} />),
  };
}

describe('ClipsInputForm', () => {
  it('starts the one-click clip factory from the primary action', () => {
    const { props } = renderForm();

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
});
