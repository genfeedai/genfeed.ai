import { render, screen } from '@testing-library/react';
import MergeProgressBars from '@ui/storyboard/merge-progress-bars/MergeProgressBars';
import { describe, expect, it } from 'vitest';

describe('MergeProgressBars', () => {
  it('renders all steps', () => {
    const steps = [
      { id: '1', label: 'Step 1', status: 'completed' as const },
      { id: '2', label: 'Step 2', progress: 50, status: 'active' as const },
      { id: '3', label: 'Step 3', status: 'pending' as const },
    ];

    render(<MergeProgressBars steps={steps} />);

    expect(screen.getByText('Step 1')).toBeInTheDocument();
    expect(screen.getByText('Step 2')).toBeInTheDocument();
    expect(screen.getByText('Step 3')).toBeInTheDocument();
  });

  it('shows progress bar for active step', () => {
    const steps = [
      { id: '1', label: 'Step 1', progress: 75, status: 'active' as const },
    ];

    const { container } = render(<MergeProgressBars steps={steps} />);

    const progressBar = container.querySelector('.bg-primary') as HTMLElement;
    expect(progressBar).toBeInTheDocument();
    expect(progressBar).toHaveStyle({ width: '75%' });
  });

  it('shows checkmark for completed steps', () => {
    const steps = [{ id: '1', label: 'Step 1', status: 'completed' as const }];

    const { container } = render(<MergeProgressBars steps={steps} />);
    const checkIcon = container.querySelector('.text-success');
    expect(checkIcon).toBeInTheDocument();
  });

  it('shows error icon for failed steps', () => {
    const steps = [{ id: '1', label: 'Step 1', status: 'failed' as const }];

    const { container } = render(<MergeProgressBars steps={steps} />);
    const errorIcon = container.querySelector('.text-error');
    expect(errorIcon).toBeInTheDocument();
  });

  it('shows overall progress bar when overallProgress is provided', () => {
    const steps = [
      { id: '1', label: 'Step 1', progress: 50, status: 'active' as const },
    ];

    render(<MergeProgressBars steps={steps} overallProgress={45} />);

    expect(screen.getByText('Overall Progress')).toBeInTheDocument();
    expect(screen.getByText('45%')).toBeInTheDocument();
  });

  it('does not show overall progress bar when overallProgress is undefined', () => {
    const steps = [
      { id: '1', label: 'Step 1', progress: 50, status: 'active' as const },
    ];

    render(<MergeProgressBars steps={steps} />);

    expect(screen.queryByText('Overall Progress')).not.toBeInTheDocument();
  });
});
