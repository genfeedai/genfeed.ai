import type { ITrendHashtag } from '@genfeedai/contracts/interfaces';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';
import pages from '../../../../../../apps/app/messages/en/pages.json';
import TrendingHashtags from './trending-hashtags';

const hashtag: ITrendHashtag = {
  id: 'tag-1',
  hashtag: 'aiagents',
  platform: 'tiktok',
  postCount: 0,
  viewCount: 0,
  viralityScore: 50,
  growthRate: 0,
  relatedHashtags: [],
};

describe('TrendingHashtags metric controls', () => {
  it('keeps the whole-card action separate from tooltip buttons', async () => {
    const onHashtagClick = vi.fn();
    const { container } = render(
      <NextIntlClientProvider locale="en" messages={{ pages }}>
        <TrendingHashtags
          hashtags={[hashtag]}
          onHashtagClick={onHashtagClick}
        />
      </NextIntlClientProvider>,
    );
    expect(container.querySelector('button button')).toBeNull();
    const action = screen.getByRole('button', { name: '#aiagents' });
    expect(action).toHaveClass('absolute', 'inset-0', 'focus-visible:ring-2');
    fireEvent.click(action);
    expect(onHashtagClick).toHaveBeenCalledExactlyOnceWith(hashtag);
    onHashtagClick.mockClear();
    const trigger = screen.getByRole('button', { name: 'About Posts' });
    act(() => trigger.focus());
    const tooltip = await screen.findByRole('tooltip');
    expect(tooltip).toHaveTextContent(
      'Published posts included in the visible scoped query.',
    );
    expect(trigger).toHaveAttribute('aria-describedby', tooltip.id);
    fireEvent.click(trigger);
    fireEvent.keyDown(trigger, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('tooltip')).toBeNull());
    expect(onHashtagClick).not.toHaveBeenCalled();
    const viewsTrigger = screen.getByRole('button', { name: 'About Views' });
    act(() => viewsTrigger.focus());
    const viewsTooltip = await screen.findByRole('tooltip');
    expect(viewsTooltip).toHaveTextContent(
      'Platform-reported views for the selected published content.',
    );
    expect(viewsTrigger).toHaveAttribute('aria-describedby', viewsTooltip.id);
    fireEvent.click(viewsTrigger);
    fireEvent.keyDown(viewsTrigger, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('tooltip')).toBeNull());
    expect(onHashtagClick).not.toHaveBeenCalled();
  });
  it('offers only definitions when no hashtag action is provided', () => {
    render(
      <NextIntlClientProvider locale="en" messages={{ pages }}>
        <TrendingHashtags hashtags={[hashtag]} />
      </NextIntlClientProvider>,
    );
    expect(screen.queryByRole('button', { name: '#aiagents' })).toBeNull();
    expect(screen.getAllByRole('button')).toHaveLength(2);
  });
});
