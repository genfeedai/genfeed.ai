import CampaignNeedsYou from '@pages/agents/campaigns/CampaignNeedsYou';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';

describe('CampaignNeedsYou', () => {
  it('renders nothing when the campaign is not paused', () => {
    const { container } = render(
      <CampaignNeedsYou
        isPaused={false}
        onResume={vi.fn()}
        pausedDescription="Paused"
        resumeLabel="Resume"
        title="Needs you"
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when there is no resume handler even if paused', () => {
    const { container } = render(
      <CampaignNeedsYou
        isPaused
        pausedDescription="Paused"
        resumeLabel="Resume"
        title="Needs you"
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });

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
});
