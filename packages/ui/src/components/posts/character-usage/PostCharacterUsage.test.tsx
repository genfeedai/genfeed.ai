import type { PostCharacterUsageItem } from '@genfeedai/props/posts/post-character-usage.props';
import { render, screen } from '@testing-library/react';
import PostCharacterUsage from '@ui/posts/character-usage/PostCharacterUsage';
import { describe, expect, it } from 'vitest';

const items: PostCharacterUsageItem[] = [
  {
    accountLabel: 'Nevo David',
    id: 'cred-li',
    limit: 3000,
    platformLabel: 'LinkedIn',
    used: 50,
  },
  {
    accountLabel: 'GitHub20k',
    id: 'cred-fb',
    limit: 63_206,
    platformLabel: 'Facebook',
    used: 50,
  },
];

describe('PostCharacterUsage', () => {
  it('shows used and limit for every channel', () => {
    render(<PostCharacterUsage items={items} />);

    expect(screen.getByText('Nevo David (LinkedIn)')).toBeInTheDocument();
    expect(screen.getByText('50/3,000')).toBeInTheDocument();
    expect(screen.getByText('50/63,206')).toBeInTheDocument();
  });

  it('renders nothing when no channel is selected', () => {
    const { container } = render(<PostCharacterUsage items={[]} />);

    expect(container).toBeEmptyDOMElement();
  });

  it('marks an over-limit channel as an error', () => {
    render(
      <PostCharacterUsage
        items={[
          { ...items[0], limit: 280, used: 300 } as PostCharacterUsageItem,
        ]}
      />,
    );

    expect(screen.getByText('300/280').className).toContain('text-error');
  });
});
