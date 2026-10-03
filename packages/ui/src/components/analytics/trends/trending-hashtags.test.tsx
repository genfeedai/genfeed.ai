import type { ITrendHashtag } from '@genfeedai/contracts/interfaces';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import TrendingHashtags from './trending-hashtags';

const hashtag: ITrendHashtag = {
  id: 'tag-1',
  hashtag: 'aiagents',
  platform: 'tiktok',
  postCount: 1200,
  viewCount: 90000,
  viralityScore: 50,
  growthRate: 0,
  relatedHashtags: [],
};

describe('TrendingHashtags external metrics', () => {
  it.each([hashtag, { ...hashtag, postCount: 0, viewCount: 0 }])(
    'shows platform counts without scoped published-content definitions: %j',
    (trend) => {
      render(<TrendingHashtags hashtags={[trend]} />);
      expect(screen.getByText('Posts')).toBeInTheDocument();
      expect(screen.getByText('Views')).toBeInTheDocument();
      if (trend.postCount) {
        expect(screen.getByText('1.2k')).toBeInTheDocument();
        expect(screen.getByText('90.0k')).toBeInTheDocument();
      } else {
        expect(screen.getAllByText('0')).toHaveLength(2);
      }
      expect(screen.queryByRole('button', { name: /^About / })).toBeNull();
      expect(screen.queryByRole('tooltip')).toBeNull();
    },
  );

  it('preserves the whole-card action as a keyboard-focusable button', () => {
    const onHashtagClick = vi.fn();
    const { container } = render(
      <TrendingHashtags hashtags={[hashtag]} onHashtagClick={onHashtagClick} />,
    );
    expect(container.querySelector('button button')).toBeNull();
    const action = screen.getByRole('button', { name: '#aiagents' });
    expect(action).toHaveClass('absolute', 'inset-0', 'focus-visible:ring-2');
    expect(action).toHaveAttribute('type', 'button');
    expect(screen.getAllByRole('button')).toHaveLength(1);
    fireEvent.click(action);
    expect(onHashtagClick).toHaveBeenCalledExactlyOnceWith(hashtag);
  });
});
