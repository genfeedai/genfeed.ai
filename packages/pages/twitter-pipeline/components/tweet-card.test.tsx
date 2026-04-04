import TweetCard from '@pages/twitter-pipeline/components/tweet-card';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom';

const mockTweet = {
  author: {
    handle: 'testuser',
    name: 'Test User',
    profileImageUrl: 'https://example.com/avatar.png',
  },
  content: 'Test tweet content',
  createdAt: '2024-01-01T10:00:00Z',
  id: '1',
  likes: 10,
  replies: 5,
  retweets: 3,
};

vi.mock('next/image', () => ({
  default: ({ src, alt, ...props }: Record<string, unknown>) => (
    <img src={src as string} alt={alt as string} {...props} />
  ),
}));

describe('TweetCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

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
