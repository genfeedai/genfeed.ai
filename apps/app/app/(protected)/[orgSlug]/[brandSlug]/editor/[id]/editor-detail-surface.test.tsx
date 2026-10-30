// @vitest-environment jsdom

import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { EditorPageContentProps } from '@/features/studio/props/editor-page-content.props';
import EditorDetailSurface from './editor-detail-surface';

const { contentState } = vi.hoisted(() => ({
  contentState: {
    pending: null as Promise<void> | null,
    error: null as Error | null,
  },
}));

vi.mock('next/dynamic', async () => {
  const { lazy } = await import('react');
  return { default: lazy };
});
vi.mock('./editor-page-content', () => ({
  default: ({ projectId }: EditorPageContentProps) => {
    if (contentState.error) throw contentState.error;
    if (contentState.pending) throw contentState.pending;
    return <div data-testid="editor-content">{projectId}</div>;
  },
}));
vi.mock('@genfeedai/services/core/deferred-logger', () => ({
  deferredLogger: { error: vi.fn() },
}));
vi.mock('@genfeedai/helpers/ui/modal/modal.helper', () => ({
  openModal: vi.fn(),
  closeModal: vi.fn(),
}));
vi.mock('@genfeedai/services/core/error-debug-store', () => ({
  setErrorDebugInfo: vi.fn(),
}));

afterEach(() => {
  contentState.pending = null;
  contentState.error = null;
  vi.restoreAllMocks();
});

describe('EditorDetailSurface', () => {
  it('renders the explicit project ID through the lazy content', async () => {
    render(<EditorDetailSurface projectId="surface-project-1" />);
    expect(await screen.findByTestId('editor-content')).toHaveTextContent(
      'surface-project-1',
    );
  });

  it('keeps the Suspense fallback empty until content is ready', async () => {
    const deferred = Promise.withResolvers<void>();
    contentState.pending = deferred.promise;
    const { container } = render(
      <EditorDetailSurface projectId="surface-project-2" />,
    );
    expect(container).toBeEmptyDOMElement();
    await act(async () => {
      contentState.pending = null;
      deferred.resolve();
      await deferred.promise;
    });
    expect(await screen.findByTestId('editor-content')).toHaveTextContent(
      'surface-project-2',
    );
  });

  it('retains the real inner error boundary for client render failures', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    contentState.error = new Error('Editor render failed');
    render(<EditorDetailSurface projectId="surface-project-error" />);
    expect(
      await screen.findByRole('heading', { name: 'Something went wrong' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Editor render failed')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Try again' }),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('editor-content')).not.toBeInTheDocument();
  });
});
