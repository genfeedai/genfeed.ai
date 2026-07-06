import type { ITwitterSearchResult } from '@genfeedai/interfaces';
import TweetCard from '@pages/twitter-pipeline/components/tweet-card';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import '@testing-library/jest-dom/vitest';

const mockTweet: ITwitterSearchResult = {
  id: '1',
  text: 'Test tweet content',
  authorUsername: 'testuser',
  authorName: 'Test User',
  createdAt: '2024-01-01T10:00:00Z',
  likes: 10,
  retweets: 3,
  replies: 5,
  quotes: 2,
  engagement: 20,
};

describe('TweetCard', () => {
  it('should render without crashing', () => {
    const { container } = render(<TweetCard tweet={mockTweet} />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should display tweet content and author info', () => {
    render(<TweetCard tweet={mockTweet} />);
    expect(screen.getByText('Test tweet content')).toBeInTheDocument();
    expect(screen.getByText('Test User')).toBeInTheDocument();
    expect(screen.getByText('@testuser')).toBeInTheDocument();
  });

  it('should display engagement metrics', () => {
    render(<TweetCard tweet={mockTweet} />);
    expect(screen.getByText('10')).toBeInTheDocument(); // likes
    expect(screen.getByText('5')).toBeInTheDocument(); // replies
    expect(screen.getByText('3')).toBeInTheDocument(); // retweets
  });
});
