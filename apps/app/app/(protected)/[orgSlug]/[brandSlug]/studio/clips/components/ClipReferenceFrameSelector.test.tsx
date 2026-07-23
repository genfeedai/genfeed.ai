import '@testing-library/jest-dom/vitest';
import type { ClipReferenceFrameSet } from '@genfeedai/interfaces';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ClipReferenceFrameSelector from './ClipReferenceFrameSelector';

function createReferenceFrames(
  overrides: Partial<ClipReferenceFrameSet> = {},
): ClipReferenceFrameSet {
  return {
    candidates: [
      {
        diagnostics: [],
        id: 'frame-1',
        status: 'available',
        timestampSeconds: 12,
        url: 'https://cdn.test/frame-1.jpg',
      },
      {
        diagnostics: [],
        id: 'frame-2',
        status: 'available',
        timestampSeconds: 75,
        url: 'https://cdn.test/frame-2.jpg',
      },
    ],
    diagnostics: [],
    schemaVersion: 1,
    selectedCandidateId: null,
    status: 'ready',
    ...overrides,
  };
}

describe('ClipReferenceFrameSelector', () => {
  it('renders ready frames with meaningful alt text and native keyboard-ready controls', () => {
    const onSelect = vi.fn();
    render(
      <ClipReferenceFrameSelector
        error={null}
        onRetry={vi.fn()}
        onSelect={onSelect}
        pendingCandidateId={null}
        referenceFrames={createReferenceFrames()}
      />,
    );

    expect(
      screen.getByAltText('Reference frame at 0:12 from the source video'),
    ).toBeInTheDocument();

    const frame = screen.getByRole('button', {
      name: 'Select reference frame at 1:15',
    });
    frame.focus();
    fireEvent.click(frame);

    expect(frame).toHaveFocus();
    expect(frame).toHaveAttribute('type', 'button');
    expect(onSelect).toHaveBeenCalledWith('frame-2');
  });

  it('identifies the selected frame and exposes its pressed state', () => {
    render(
      <ClipReferenceFrameSelector
        error={null}
        onRetry={vi.fn()}
        onSelect={vi.fn()}
        pendingCandidateId={null}
        referenceFrames={createReferenceFrames({
          selectedCandidateId: 'frame-1',
          status: 'selected',
        })}
      />,
    );

    expect(
      screen.getByRole('button', {
        name: 'Selected reference frame at 0:12',
      }),
    ).toHaveAttribute('aria-pressed', 'true');
  });

  it('keeps partial and unavailable reference states non-blocking', () => {
    const { rerender } = render(
      <ClipReferenceFrameSelector
        error={null}
        onRetry={vi.fn()}
        onSelect={vi.fn()}
        pendingCandidateId={null}
        referenceFrames={createReferenceFrames({
          candidates: [
            {
              diagnostics: [
                {
                  candidateId: 'frame-failed',
                  code: 'candidate_failed',
                  message: 'This frame could not be extracted.',
                  severity: 'warning',
                },
              ],
              id: 'frame-failed',
              status: 'failed',
              timestampSeconds: 40,
            },
            {
              diagnostics: [],
              id: 'frame-ready',
              status: 'available',
              timestampSeconds: 50,
              url: 'https://cdn.test/frame-ready.jpg',
            },
          ],
          status: 'partial',
        })}
      />,
    );

    expect(
      screen.getByText(/available frames remain selectable/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', {
        name: 'Select reference frame at 0:40',
      }),
    ).toBeDisabled();

    rerender(
      <ClipReferenceFrameSelector
        error={null}
        onRetry={vi.fn()}
        onSelect={vi.fn()}
        pendingCandidateId={null}
        referenceFrames={createReferenceFrames({
          candidates: [],
          status: 'unavailable',
        })}
      />,
    );

    expect(
      screen.getByText(/continue reviewing highlights/i),
    ).toBeInTheDocument();
  });

  it('shows pending and retryable error states', () => {
    const onRetry = vi.fn();
    const { rerender } = render(
      <ClipReferenceFrameSelector
        error={null}
        onRetry={onRetry}
        onSelect={vi.fn()}
        pendingCandidateId="frame-2"
        referenceFrames={createReferenceFrames()}
      />,
    );

    expect(
      screen.getByRole('button', {
        name: 'Select reference frame at 1:15',
      }),
    ).toHaveAttribute('aria-busy', 'true');

    rerender(
      <ClipReferenceFrameSelector
        error="Reference frame selection could not be saved. Try again."
        onRetry={onRetry}
        onSelect={vi.fn()}
        pendingCandidateId={null}
        referenceFrames={createReferenceFrames()}
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Reference frame selection could not be saved. Try again.',
    );

    const retry = screen.getByRole('button', { name: 'Retry selection' });
    fireEvent.click(retry);

    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
