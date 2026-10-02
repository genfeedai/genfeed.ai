import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Form } from '@ui/primitives/form';
import { NextIntlClientProvider } from 'next-intl';
import type { FormEvent } from 'react';
import { describe, expect, it, vi } from 'vitest';
import pages from '../../../../../../apps/app/messages/en/pages.json';
import AnalyticsMetricInfo, {
  AnalyticsMetricLabel,
} from './AnalyticsMetricInfo';

const cases = [
  [
    'comments',
    'Comments',
    'Comments recorded across the selected published content.',
  ],
  [
    'engagement',
    'Engagement',
    'Total recorded interactions across the selected content.',
  ],
  [
    'engagementRate',
    'Engagement rate',
    'Recorded interactions divided by the applicable audience or view denominator.',
  ],
  ['likes', 'Likes', 'Likes recorded across the selected published content.'],
  ['posts', 'Posts', 'Published posts included in the visible scoped query.'],
  ['saves', 'Saves', 'Saves recorded across the selected published content.'],
  [
    'shares',
    'Shares',
    'Shares recorded across the selected published content.',
  ],
  [
    'views',
    'Views',
    'Platform-reported views for the selected published content.',
  ],
] as const;

function renderMetric(metric: string) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ pages }}>
      <AnalyticsMetricInfo metric={metric} />
    </NextIntlClientProvider>,
  );
}

describe('AnalyticsMetricInfo with real translated primitives', () => {
  it.each(cases)(
    'opens the %s definition on focus and dismisses on Escape',
    async (metric, label, definition) => {
      renderMetric(metric);
      const trigger = screen.getByRole('button', { name: `About ${label}` });
      expect(trigger).toBeEnabled();
      expect(trigger).toHaveAttribute('type', 'button');
      expect(trigger).toHaveClass('focus-visible:ring-2');
      expect(trigger.querySelector('svg')).toHaveAttribute(
        'aria-hidden',
        'true',
      );
      act(() => trigger.focus());
      const tooltip = await screen.findByRole('tooltip');
      expect(tooltip).toHaveTextContent(definition);
      expect(trigger).toHaveAttribute('aria-describedby', tooltip.id);
      fireEvent.keyDown(trigger, { key: 'Escape' });
      await waitFor(() => expect(screen.queryByRole('tooltip')).toBeNull());
      expect(trigger).not.toHaveAttribute('aria-describedby');
    },
  );

  it('opens on hover and closes on pointer leave and blur', async () => {
    const user = userEvent.setup();
    renderMetric('views');
    const trigger = screen.getByRole('button', { name: 'About Views' });
    await user.hover(trigger);
    expect(await screen.findByRole('tooltip')).toHaveTextContent(cases[7][2]);
    await user.unhover(trigger);
    await waitFor(() => expect(screen.queryByRole('tooltip')).toBeNull());
    act(() => trigger.focus());
    await screen.findByRole('tooltip');
    act(() => trigger.blur());
    await waitFor(() => expect(screen.queryByRole('tooltip')).toBeNull());
  });

  it('gives repeated metrics independent description IDs and suppresses ancestor actions', async () => {
    const onClick = vi.fn();
    render(
      <NextIntlClientProvider locale="en" messages={{ pages }}>
        <div onClick={onClick}>
          <AnalyticsMetricInfo metric="posts" />
          <AnalyticsMetricInfo metric="posts" />
        </div>
      </NextIntlClientProvider>,
    );
    const triggers = screen.getAllByRole('button', { name: 'About Posts' });
    act(() => triggers[0].focus());
    const first = (await screen.findByRole('tooltip')).id;
    fireEvent.click(triggers[0]);
    expect(onClick).not.toHaveBeenCalled();
    act(() => triggers[1].focus());
    const second = (await screen.findByRole('tooltip')).id;
    expect(second).not.toBe(first);
    expect(triggers[1]).toHaveAttribute('aria-describedby', second);
    expect(triggers[0].querySelector('button')).toBeNull();
  });

  it.each([
    'followers',
    'percentEngagement',
    'totalLikes',
    '__proto__',
    'constructor',
  ])('does not guess a definition for %s', (metric) => {
    renderMetric(metric);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('retains a surface label while naming the trigger with the canonical label', () => {
    render(
      <NextIntlClientProvider locale="en" messages={{ pages }}>
        <AnalyticsMetricLabel metric="likes">Engagement</AnalyticsMetricLabel>
      </NextIntlClientProvider>,
    );
    expect(screen.getByText('Engagement')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'About Likes' }),
    ).toBeInTheDocument();
  });
  it('does not submit a surrounding form when activated with the keyboard', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn((event: FormEvent<HTMLFormElement>) =>
      event.preventDefault(),
    );
    render(
      <NextIntlClientProvider locale="en" messages={{ pages }}>
        <Form onSubmit={onSubmit}>
          <AnalyticsMetricInfo metric="likes" />
        </Form>
      </NextIntlClientProvider>,
    );
    await user.tab();
    expect(screen.getByRole('button', { name: 'About Likes' })).toHaveFocus();
    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      'Likes recorded across the selected published content.',
    );
    await user.keyboard('{Enter}');
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
