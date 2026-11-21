import { render, screen } from '@testing-library/react';
import ConnectedAccountStack from '@ui/display/connected-account/ConnectedAccountStack';
import { describe, expect, it } from 'vitest';

const items = [
  { id: '1', platform: 'instagram', handle: 'genfeed' },
  { id: '2', platform: 'tiktok', handle: 'genfeed.tt' },
  { id: '3', platform: 'youtube', name: 'Genfeed TV' },
  { id: '4', platform: 'linkedin' },
  { id: '5', platform: 'twitter', handle: 'genfeedai' },
];

describe('ConnectedAccountStack', () => {
  it('shows at most three avatars and an overflow count', () => {
    render(<ConnectedAccountStack items={items} />);

    const trigger = screen.getByTestId('connected-account-stack');
    expect(trigger.tagName).toBe('BUTTON');
    expect(trigger.children).toHaveLength(4);
    expect(trigger).toHaveTextContent('+2');
    expect(trigger).toHaveAccessibleName(/^5 connected: /);
  });

  it('shows no overflow chip at or under the limit', () => {
    render(<ConnectedAccountStack items={items.slice(0, 3)} />);

    const trigger = screen.getByTestId('connected-account-stack');
    expect(trigger.children).toHaveLength(3);
    expect(trigger).not.toHaveTextContent('+');
  });

  it('renders the empty label without a hover trigger', () => {
    render(<ConnectedAccountStack emptyLabel="None" items={[]} />);

    expect(screen.getByText('None')).toBeInTheDocument();
    expect(screen.queryByTestId('connected-account-stack')).toBeNull();
  });
});
