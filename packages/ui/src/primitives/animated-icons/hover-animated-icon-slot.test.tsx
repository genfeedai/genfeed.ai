import { fireEvent, render, screen } from '@testing-library/react';
import { Bell, Settings } from 'lucide-react';
import { forwardRef, useImperativeHandle } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  AnimatedIconHandle,
  AnimatedIconProps,
} from './animated-icon.types';
import { HoverAnimatedIconSlot } from './hover-animated-icon-slot';

const { handle } = vi.hoisted(() => ({
  handle: { startAnimation: vi.fn(), stopAnimation: vi.fn() },
}));

vi.mock('./animated-icon.registry', async () => {
  const { Bell: BellIcon } = await import('lucide-react');
  const FakeAnimatedBell = forwardRef<AnimatedIconHandle, AnimatedIconProps>(
    ({ className }, ref) => {
      useImperativeHandle(ref, () => handle);
      return <div className={className} data-testid="animated-bell" />;
    },
  );
  return {
    findAnimatedIcon: (icon: unknown) =>
      icon === BellIcon ? FakeAnimatedBell : undefined,
  };
});

describe('HoverAnimatedIconSlot', () => {
  beforeEach(() => {
    handle.startAnimation.mockClear();
    handle.stopAnimation.mockClear();
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: false }));
  });

  it('animates when the surrounding button is pointed at, not just the glyph', async () => {
    render(
      <button type="button">
        <HoverAnimatedIconSlot icon={<Bell className="size-4" />} />
        Notifications
      </button>,
    );

    fireEvent.mouseEnter(screen.getByRole('button'));

    expect(await screen.findByTestId('animated-bell')).toHaveClass('size-4');
    expect(handle.startAnimation).toHaveBeenCalled();
  });

  it('keeps listening after the twin replaces the static icon', async () => {
    render(
      <button type="button">
        <HoverAnimatedIconSlot icon={<Bell className="size-4" />} />
      </button>,
    );
    const button = screen.getByRole('button');

    fireEvent.mouseEnter(button);
    await screen.findByTestId('animated-bell');
    fireEvent.mouseLeave(button);

    expect(handle.stopAnimation).toHaveBeenCalled();
  });

  it('gives an unsized icon the size its host would force', async () => {
    render(
      <button type="button">
        <HoverAnimatedIconSlot defaultSizeClassName="size-4" icon={<Bell />} />
      </button>,
    );

    fireEvent.mouseEnter(screen.getByRole('button'));

    expect(await screen.findByTestId('animated-bell')).toHaveClass('size-4');
  });

  it('renders an icon without a twin untouched', () => {
    render(
      <button type="button">
        <HoverAnimatedIconSlot icon={<Settings className="size-4" />} />
      </button>,
    );

    fireEvent.mouseEnter(screen.getByRole('button'));

    expect(screen.queryByTestId('animated-bell')).not.toBeInTheDocument();
    expect(document.querySelector('svg.lucide-settings')).toBeInTheDocument();
  });
});
