import type { IAnalytics } from '@genfeedai/contracts/interfaces';
import { act, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it } from 'vitest';
import pages from '../../../../apps/app/messages/en/pages.json';
import BrandKPISection from './BrandKPISection';

describe('BrandKPISection metric definitions', () => {
  it.each([0, undefined])(
    'labels the positive likes fallback when total engagement is %s',
    (totalEngagement) => {
      const analytics = {
        totalEngagement,
        totalLikes: 12,
        totalPosts: 4,
        totalViews: 100,
      } as unknown as IAnalytics;
      render(
        <NextIntlClientProvider locale="en" messages={{ pages }}>
          <BrandKPISection
            analytics={analytics}
            isLoading={false}
            platformCount={1}
          />
        </NextIntlClientProvider>,
      );
      expect(
        screen.getByRole('button', { name: 'About Likes' }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: 'About Engagement' }),
      ).toBeNull();
    },
  );
  it('preserves aggregate engagement and shows the average calculation through the real KPI/card chain', async () => {
    const analytics = {
      totalEngagement: 20,
      totalLikes: 12,
      totalPosts: 4,
      totalViews: 100,
    } as unknown as IAnalytics;
    render(
      <NextIntlClientProvider locale="en" messages={{ pages }}>
        <BrandKPISection
          analytics={analytics}
          isLoading={false}
          platformCount={1}
        />
      </NextIntlClientProvider>,
    );
    expect(
      screen.getByRole('button', { name: 'About Engagement' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'About Likes' })).toBeNull();
    expect(screen.getByText('Avg Views/Post')).toBeInTheDocument();
    act(() =>
      screen
        .getByRole('button', { name: 'About Average views per post' })
        .focus(),
    );
    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      'Platform-reported views divided by the number of selected published posts.',
    );
  });
});
