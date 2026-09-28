import { IngredientFormat } from '@genfeedai/contracts';
import { render, screen } from '@testing-library/react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import EditorToolbar from './EditorToolbar';
import '@testing-library/jest-dom/vitest';

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

describe('EditorToolbar', () => {
  beforeAll(() => {
    globalThis.ResizeObserver = ResizeObserverMock as typeof ResizeObserver;
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render without crashing', () => {
    const { container } = render(
      <EditorToolbar
        projectName="Test Project"
        format={IngredientFormat.LANDSCAPE}
        isPlaying={false}
        currentFrame={0}
        totalFrames={300}
        fps={30}
        zoom={1}
        isDirty={false}
        isRendering={false}
        onPlayPause={vi.fn()}
        onSeekStart={vi.fn()}
        onSeekEnd={vi.fn()}
        onStepBack={vi.fn()}
        onStepForward={vi.fn()}
        onZoomChange={vi.fn()}
        onFormatChange={vi.fn()}
        onAddVideoTrack={vi.fn()}
        onAddAudioTrack={vi.fn()}
        onSave={vi.fn()}
        onRender={vi.fn()}
        onBack={vi.fn()}
      />,
    );

    expect(container.firstChild).toBeInTheDocument();
  });

  it('disables editing, save and render for a read-only project but keeps playback', () => {
    render(
      <EditorToolbar
        projectName="Locked Project"
        format={IngredientFormat.LANDSCAPE}
        isPlaying={false}
        currentFrame={0}
        totalFrames={300}
        fps={30}
        zoom={1}
        isDirty={true}
        isReadOnly={true}
        isRendering={false}
        onPlayPause={vi.fn()}
        onSeekStart={vi.fn()}
        onSeekEnd={vi.fn()}
        onStepBack={vi.fn()}
        onStepForward={vi.fn()}
        onZoomChange={vi.fn()}
        onFormatChange={vi.fn()}
        onAddVideoTrack={vi.fn()}
        onAddAudioTrack={vi.fn()}
        onSave={vi.fn()}
        onRender={vi.fn()}
        onBack={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Render' })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Video/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Audio/ })).toBeDisabled();
    expect(screen.getByRole('combobox')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Back' })).toBeEnabled();
    expect(screen.getByRole('slider')).not.toHaveAttribute('data-disabled');
    expect(screen.getByText('(read-only)')).toBeInTheDocument();
  });
});
