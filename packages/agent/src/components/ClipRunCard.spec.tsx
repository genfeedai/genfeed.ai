import { ClipRunCard } from '@cloud/agent/components/ClipRunCard';
import type {
  ClipRunCardState,
  ClipRunModes,
  ClipRunStep,
} from '@cloud/agent/models/clip-run-card.model';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

function makeStep(overrides: Partial<ClipRunStep> = {}): ClipRunStep {
  return {
    id: 'generate',
    label: 'Generate Clip',
    retryable: false,
    status: 'pending',
    ...overrides,
  };
}

function makeModes(overrides: Partial<ClipRunModes> = {}): ClipRunModes {
  return {
    aspectRatio: '16:9',
    confirmBeforePublish: true,
    duration: 30,
    enableMerge: false,
    enableReframe: false,
    platform: 'twitter',
    ...overrides,
  };
}

function makeState(
  overrides: Partial<ClipRunCardState> = {},
): ClipRunCardState {
  return {
    brandId: 'brand-1',
    clipProjectId: 'proj-1',
    currentStep: 'generate',
    modes: makeModes(),
    organizationId: 'org-1',
    status: 'idle',
    steps: [
      makeStep({ id: 'generate', label: 'Generate Clip', status: 'pending' }),
      makeStep({ id: 'merge', label: 'Merge Clips', status: 'pending' }),
      makeStep({ id: 'reframe', label: 'Reframe Portrait', status: 'pending' }),
      makeStep({
        id: 'publish-handoff',
        label: 'Publish Handoff',
        status: 'pending',
      }),
    ],
    ...overrides,
  };
}

describe('ClipRunCard', () => {
  it('renders step list', () => {
    render(<ClipRunCard state={makeState()} />);

    expect(screen.getByText('Generate Clip')).toBeDefined();
    expect(screen.getByText('Merge Clips')).toBeDefined();
    expect(screen.getByText('Reframe Portrait')).toBeDefined();
    expect(screen.getByText('Publish Handoff')).toBeDefined();
  });

  it('shows running state for current step', () => {
    const state = makeState({
      currentStep: 'generate',
      status: 'running',
      steps: [
        makeStep({ id: 'generate', label: 'Generate Clip', status: 'running' }),
        makeStep({ id: 'merge', label: 'Merge Clips', status: 'pending' }),
      ],
    });

    render(<ClipRunCard state={state} />);

    expect(screen.getByText('Running')).toBeDefined();
    // The running step should display the 🔄 icon
    const stepRow = screen.getByText('Generate Clip').closest('div');
    expect(stepRow?.textContent).toContain('🔄');
  });

  it('shows confirmation prompt when confirmationPending=true', async () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    const state = makeState({
      confirmationMessage: 'Ready to publish?',
      confirmationPending: true,
      status: 'running',
    });

    render(
      <ClipRunCard state={state} onConfirm={onConfirm} onCancel={onCancel} />,
    );

    expect(screen.getByText('Ready to publish?')).toBeDefined();
    expect(screen.getByText('Confirm')).toBeDefined();
    expect(screen.getByText('Cancel')).toBeDefined();

    const user = userEvent.setup();
    await user.click(screen.getByText('Confirm'));
    expect(onConfirm).toHaveBeenCalledOnce();

    await user.click(screen.getByText('Cancel'));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it('shows final output link when done', () => {
    const state = makeState({
      finalOutputUrl: 'https://example.com/output.mp4',
      status: 'done',
      steps: [
        makeStep({ id: 'generate', label: 'Generate Clip', status: 'done' }),
      ],
    });

    render(<ClipRunCard state={state} />);

    const link = screen.getByText('View Final Output');
    expect(link).toBeDefined();
    expect(link.closest('a')?.getAttribute('href')).toBe(
      'https://example.com/output.mp4',
    );
  });

  it('shows error state with message', () => {
    const state = makeState({
      status: 'failed',
      steps: [
        makeStep({
          errorMessage: 'GPU timeout',
          id: 'generate',
          label: 'Generate Clip',
          retryable: true,
          status: 'failed',
        }),
      ],
    });

    render(<ClipRunCard state={state} />);

    expect(screen.getByText('Failed at: Generate Clip')).toBeDefined();
    expect(screen.getByText('GPU timeout')).toBeDefined();
    expect(screen.getByText('This step can be retried.')).toBeDefined();
  });

  it('displays mode toggles correctly', () => {
    const state = makeState({
      modes: makeModes({
        aspectRatio: '9:16',
        confirmBeforePublish: true,
        duration: 60,
        enableMerge: true,
        enableReframe: false,
        platform: 'instagram',
      }),
    });

    render(<ClipRunCard state={state} />);

    expect(screen.getByText('Instagram')).toBeDefined();
    expect(screen.getByText('60s')).toBeDefined();
    expect(screen.getByText('9:16')).toBeDefined();
    // Merge enabled
    const mergeText = screen.getByText('Merge Enabled');
    const mergeRow = mergeText.parentElement;
    expect(mergeRow?.textContent).toContain('✓');
    // Reframe disabled
    const reframeText = screen.getByText('Reframe Enabled');
    const reframeRow = reframeText.parentElement;
    expect(reframeRow?.textContent).toContain('✗');
  });
});
