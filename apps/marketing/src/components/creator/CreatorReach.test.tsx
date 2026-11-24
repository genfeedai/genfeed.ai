import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import CreatorReach from './CreatorReach';

describe('CreatorReach', () => {
  it('shows views, impressions and engagements in compact form', () => {
    render(
      <CreatorReach
        reach={{ engagements: 48210, impressions: 1204880, views: 386420 }}
      />,
    );

    const summary = screen.getByTestId('creator-reach');
    expect(summary).toHaveTextContent('386K');
    expect(summary).toHaveTextContent('1.2M');
    expect(summary).toHaveTextContent('48K');
    expect(summary).toHaveTextContent('views');
    expect(summary).toHaveTextContent('impressions');
    expect(summary).toHaveTextContent('engagements');
  });

  it('leaves out a metric the platforms never reported', () => {
    render(
      <CreatorReach
        reach={{ engagements: 3120, impressions: null, views: 18400 }}
      />,
    );

    const summary = screen.getByTestId('creator-reach');
    expect(summary).toHaveTextContent('views');
    expect(summary).toHaveTextContent('engagements');
    expect(summary).not.toHaveTextContent('impressions');
  });

  it.each([
    ['no data at all', null],
    ['only zeros', { engagements: 0, impressions: 0, views: 0 }],
    ['only nulls', { engagements: null, impressions: null, views: null }],
  ])('shows nothing for %s', (_label, reach) => {
    render(<CreatorReach reach={reach} />);

    expect(screen.queryByTestId('creator-reach')).toBeNull();
  });
});
