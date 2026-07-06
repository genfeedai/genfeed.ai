import type { ITwitterOpportunity } from '@genfeedai/interfaces';
import OpportunityCard from '@pages/twitter-pipeline/components/opportunity-card';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';

const mockOpportunity: ITwitterOpportunity = {
  type: 'reply',
  suggestedText: 'Test suggested reply',
  reason: 'High engagement potential',
  verified: true,
  targetTweetId: '123',
  targetAuthor: 'someauthor',
  targetTweet: 'Original tweet text',
};

describe('OpportunityCard', () => {
  it('should render without crashing', () => {
    const { container } = render(
      <OpportunityCard
        opportunity={mockOpportunity}
        onPublish={vi.fn()}
        isPublishing={false}
      />,
    );
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should display opportunity content', () => {
    render(
      <OpportunityCard
        opportunity={mockOpportunity}
        onPublish={vi.fn()}
        isPublishing={false}
      />,
    );
    expect(screen.getByText('High engagement potential')).toBeInTheDocument();
    expect(screen.getByText('@someauthor')).toBeInTheDocument();
    expect(screen.getByText('Original tweet text')).toBeInTheDocument();
    expect(
      screen.getByDisplayValue('Test suggested reply'),
    ).toBeInTheDocument();
  });
});
