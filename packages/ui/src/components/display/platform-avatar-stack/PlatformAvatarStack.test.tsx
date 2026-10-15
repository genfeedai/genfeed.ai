import { render, screen } from '@testing-library/react';
import PlatformAvatarStack from '@ui/display/platform-avatar-stack/PlatformAvatarStack';
import { describe, expect, it } from 'vitest';

const items = [
  { id: '1', platform: 'instagram', username: 'genfeed' },
  { id: '2', platform: 'tiktok', username: 'genfeed.tt' },
  { id: '3', platform: 'youtube', label: 'Genfeed TV' },
  { id: '4', platform: 'linkedin' },
  { id: '5', platform: 'twitter', username: 'genfeedai' },
];

describe('PlatformAvatarStack', () => {
  it('shows at most three avatars and an overflow count', () => {
    render(<PlatformAvatarStack items={items} />);

    const trigger = screen.getByTestId('platform-avatar-stack');
    expect(trigger.tagName).toBe('BUTTON');
    expect(trigger.children).toHaveLength(4);
    expect(trigger).toHaveTextContent('+2');
    expect(trigger).toHaveAccessibleName(/^5 connected: /);
  });

  it('shows no overflow chip at or under the limit', () => {
    render(<PlatformAvatarStack items={items.slice(0, 3)} />);

    const trigger = screen.getByTestId('platform-avatar-stack');
    expect(trigger.children).toHaveLength(3);
    expect(trigger).not.toHaveTextContent('+');
  });

  it('renders the empty label without a hover trigger', () => {
    render(<PlatformAvatarStack emptyLabel="None" items={[]} />);

    expect(screen.getByText('None')).toBeInTheDocument();
    expect(screen.queryByTestId('platform-avatar-stack')).toBeNull();
  });
});
