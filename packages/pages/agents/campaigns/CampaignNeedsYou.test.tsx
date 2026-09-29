import CampaignNeedsYou from '@pages/agents/campaigns/CampaignNeedsYou';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';

describe('CampaignNeedsYou', () => {
  it('surfaces a paused campaign with a resume action', () => {
    const onResume = vi.fn();
    render(
      <CampaignNeedsYou
        isPaused
        onResume={onResume}
        pausedDescription="This program is paused."
        resumeLabel="Resume"
        title="Needs you"
      />,
    );

    expect(
      screen.getByRole('heading', { name: 'Needs you' }),
    ).toBeInTheDocument();
    expect(screen.getByText('This program is paused.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Resume' }));
    expect(onResume).toHaveBeenCalledTimes(1);
  });

  it('disables Resume while an execute call is already in flight, to prevent duplicate paid runs', () => {
    const onResume = vi.fn();
    render(
      <CampaignNeedsYou
        isExecuting
        isPaused
        onResume={onResume}
        pausedDescription="This program is paused."
        resumeLabel="Resume"
        title="Needs you"
      />,
    );

    const resumeButton = screen.getByRole('button', { name: 'Resume' });
    expect(resumeButton).toBeDisabled();
    fireEvent.click(resumeButton);
    expect(onResume).not.toHaveBeenCalled();
  });
});
