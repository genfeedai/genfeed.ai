import { IngredientFormat } from '@genfeedai/contracts';
import type { EditorToolbarProps } from '@props/studio/editor-toolbar.props';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import EditorToolbar from './EditorToolbar';
import '@testing-library/jest-dom/vitest';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@/../tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

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

  function renderToolbar(overrides: Partial<EditorToolbarProps> = {}) {
    const props: EditorToolbarProps = {
      canRedo: false,
      canUndo: false,
      currentFrame: 0,
      format: IngredientFormat.LANDSCAPE,
      fps: 30,
      isDirty: false,
      isPlaying: false,
      isRendering: false,
      onAddAudioTrack: vi.fn(),
      onAddVideoTrack: vi.fn(),
      onBack: vi.fn(),
      onFormatChange: vi.fn(),
      onPlayPause: vi.fn(),
      onRedo: vi.fn(),
      onRender: vi.fn(),
      onSave: vi.fn(),
      onSeekEnd: vi.fn(),
      onSeekStart: vi.fn(),
      onStepBack: vi.fn(),
      onStepForward: vi.fn(),
      onUndo: vi.fn(),
      onZoomChange: vi.fn(),
      projectName: 'Test Project',
      saveStatus: 'idle',
      totalFrames: 300,
      zoom: 1,
      ...overrides,
    };
    render(<EditorToolbar {...props} />);
    return props;
  }

  it('should render without crashing', () => {
    renderToolbar();

    expect(screen.getByText('Test Project')).toBeInTheDocument();
    expect(screen.getByTestId('editor-save-status')).toBeEmptyDOMElement();
  });

  it('disables editing, save and render for a read-only project but keeps playback', () => {
    renderToolbar({
      canRedo: true,
      canUndo: true,
      isDirty: true,
      isReadOnly: true,
      projectName: 'Locked Project',
    });

    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Render' })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Video/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Audio/ })).toBeDisabled();
    expect(screen.getByRole('combobox')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Back' })).toBeEnabled();
    expect(screen.getByRole('slider')).not.toHaveAttribute('data-disabled');
    expect(screen.getByText('(read-only)')).toBeInTheDocument();
    expect(screen.queryByTestId('editor-save-status')).not.toBeInTheDocument();
  });

  it('undoes and redoes through the toolbar only when history allows it', () => {
    const props = renderToolbar({ canRedo: false, canUndo: true });

    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(props.onUndo).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Redo' })).toBeDisabled();
  });

  it.each([
    ['saving', false, 'Saving…'],
    ['saved', false, 'All changes saved'],
    ['failed', true, 'Not saved yet. Retrying'],
    ['saved', true, 'Unsaved changes'],
    ['idle', true, 'Unsaved changes'],
  ] as const)(
    'announces the %s save state (dirty: %s)',
    (saveStatus, isDirty, label) => {
      renderToolbar({ isDirty, saveStatus });

      const indicator = screen.getByTestId('editor-save-status');
      expect(indicator).toHaveTextContent(label);
      expect(indicator).toHaveAttribute('aria-live', 'polite');
    },
  );
});
