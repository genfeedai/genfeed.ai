import type {
  ITrendHashtag,
  ITrendSound,
} from '@genfeedai/contracts/interfaces';
import { render, screen } from '@testing-library/react';
import { TrendingHashtags } from '@ui/analytics/trends/trending-hashtags';
import { TrendingSounds } from '@ui/analytics/trends/trending-sounds';
import { describe, expect, it } from 'vitest';

const VIEWPORT_LADDER = /(^|\s)(sm|md|lg|xl|2xl):grid-cols/;

const HASHTAG: ITrendHashtag = {
  growthRate: 12,
  hashtag: 'aiagents',
  id: 'hashtag-1',
  platform: 'tiktok',
  postCount: 1200,
  relatedHashtags: [],
  viewCount: 90000,
  viralityScore: 72,
};

const SOUND: ITrendSound = {
  growthRate: 8,
  id: 'sound-1',
  platform: 'tiktok',
  soundId: 'sound-1',
  soundName: 'AI Sound',
  usageCount: 3400,
  viralityScore: 65,
};

function getGrid(testId: string): HTMLElement {
  const wrapper = screen.getByTestId(testId);
  expect(wrapper).toHaveClass('@container');
  return wrapper.firstElementChild as HTMLElement;
}

describe('trend grids', () => {
  it('lays hashtags out as three-column tiles sized by the panel', () => {
    render(<TrendingHashtags hashtags={[HASHTAG]} />);

    const grid = getGrid('trending-hashtags-grid');
    expect(grid).toHaveClass('@[60rem]:grid-cols-3', 'gap-3');
    expect(grid.className).not.toContain('grid-cols-4');
    expect(grid.className).not.toMatch(VIEWPORT_LADDER);
  });

  it('mirrors the hashtag grid while loading', () => {
    render(<TrendingHashtags hashtags={[]} isLoading />);

    const grid = getGrid('trending-hashtags-skeleton');
    expect(grid).toHaveClass('@[60rem]:grid-cols-3', 'gap-3');
  });

  it('lays sounds out as three-column cards sized by the panel', () => {
    render(<TrendingSounds sounds={[SOUND]} />);

    const grid = getGrid('trending-sounds-grid');
    expect(grid).toHaveClass('@[60rem]:grid-cols-3', 'gap-4');
    expect(grid.className).not.toMatch(VIEWPORT_LADDER);
  });

  it('mirrors the sound grid while loading', () => {
    render(<TrendingSounds isLoading sounds={[]} />);

    const grid = getGrid('trending-sounds-skeleton');
    expect(grid).toHaveClass('@[60rem]:grid-cols-3', 'gap-4');
  });
});
