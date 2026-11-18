import { act, fireEvent, render, screen } from '@testing-library/react';
import { Bell, Settings } from 'lucide-react';
import { forwardRef, useImperativeHandle } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  AnimatedIconHandle,
  AnimatedIconProps,
} from './animated-icon.types';
import { useHoverAnimatedIcon } from './use-hover-animated-icon';

const { handle, preloaded } = vi.hoisted(() => ({
  handle: { startAnimation: vi.fn(), stopAnimation: vi.fn() },
  preloaded: [] as unknown[],
}));

vi.mock('./animated-icon.registry', async () => {
  const { Bell: BellIcon } = await import('lucide-react');
  const FakeAnimatedBell = forwardRef<AnimatedIconHandle, AnimatedIconProps>(
    ({ className, 'aria-hidden': ariaHidden }, ref) => {
      useImperativeHandle(ref, () => handle);
      return (
        <div
          aria-hidden={ariaHidden}
          className={className}
          data-testid="animated-bell"
        />
      );
    },
  );
  return {
    findAnimatedIcon: (icon: unknown) =>
      icon === BellIcon ? FakeAnimatedBell : undefined,
    preloadAnimatedIcon: async (icon: unknown) => {
      preloaded.push(icon);
    },
  };
});

function Host({
  icon,
  defaultSizeClassName,
}: {
  icon: React.ReactNode;
  defaultSizeClassName?: string;
}) {
  const { hoverProps, icon: node } = useHoverAnimatedIcon(icon, {
    defaultSizeClassName,
  });
  return (
    <button type="button" {...hoverProps}>
      {node}
    </button>
  );
}

function stubReducedMotion(isReduced: boolean): void {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((query: string) => ({
      addEventListener: vi.fn(),
      matches: isReduced && query.includes('prefers-reduced-motion'),
      removeEventListener: vi.fn(),
    })),
  );
}

describe('useHoverAnimatedIcon', () => {
  beforeEach(() => {
    handle.startAnimation.mockClear();
    handle.stopAnimation.mockClear();
    preloaded.length = 0;
    stubReducedMotion(false);
    vi.stubGlobal('requestIdleCallback', (callback: () => void) => {
      callback();
      return 1;
    });
    vi.stubGlobal('cancelIdleCallback', vi.fn());
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders the static icon until the control is pointed at', () => {
    render(<Host icon={<Bell className="size-4" />} />);

    expect(screen.queryByTestId('animated-bell')).not.toBeInTheDocument();
    expect(document.querySelector('svg.lucide-bell')).toBeInTheDocument();
  });

  it('swaps in the animated twin on hover and starts it', async () => {
    render(<Host icon={<Bell className="size-4" />} />);

    fireEvent.mouseEnter(screen.getByRole('button'));

    expect(await screen.findByTestId('animated-bell')).toBeInTheDocument();
    expect(document.querySelector('svg.lucide-bell')).not.toBeInTheDocument();
    expect(handle.startAnimation).toHaveBeenCalled();
  });

  it('stops the animation when the pointer leaves', async () => {
    render(<Host icon={<Bell className="size-4" />} />);
    const button = screen.getByRole('button');

    fireEvent.mouseEnter(button);
    await screen.findByTestId('animated-bell');
    fireEvent.mouseLeave(button);

    expect(handle.stopAnimation).toHaveBeenCalled();
  });

  it('replays on every later hover without remounting', async () => {
    render(<Host icon={<Bell className="size-4" />} />);
    const button = screen.getByRole('button');

    fireEvent.mouseEnter(button);
    await screen.findByTestId('animated-bell');
    fireEvent.mouseLeave(button);
    handle.startAnimation.mockClear();
    fireEvent.mouseEnter(button);

    expect(handle.startAnimation).toHaveBeenCalledTimes(1);
  });

  it('keeps the size class the host gave the icon', async () => {
    render(<Host icon={<Bell className="size-3.5 text-foreground/50" />} />);

    fireEvent.mouseEnter(screen.getByRole('button'));

    expect(await screen.findByTestId('animated-bell')).toHaveClass(
      'size-3.5',
      'text-foreground/50',
    );
  });

  it('gives an unsized icon the size its host would have forced', async () => {
    render(<Host defaultSizeClassName="size-4" icon={<Bell />} />);

    fireEvent.mouseEnter(screen.getByRole('button'));

    expect(await screen.findByTestId('animated-bell')).toHaveClass('size-4');
  });

  it('leaves an icon without an animated twin alone', () => {
    render(<Host icon={<Settings className="size-4" />} />);
    const button = screen.getByRole('button');

    fireEvent.mouseEnter(button);
    fireEvent.mouseLeave(button);

    expect(screen.queryByTestId('animated-bell')).not.toBeInTheDocument();
    expect(document.querySelector('svg.lucide-settings')).toBeInTheDocument();
    expect(handle.startAnimation).not.toHaveBeenCalled();
  });

  it('passes anything that is not an element straight through', () => {
    render(<Host icon="plain text" />);

    expect(screen.getByRole('button')).toHaveTextContent('plain text');
  });

  it('animates for keyboard focus but not for pointer focus', async () => {
    render(<Host icon={<Bell className="size-4" />} />);
    const button = screen.getByRole('button');

    vi.spyOn(button, 'matches').mockReturnValue(false);
    fireEvent.focus(button);
    expect(screen.queryByTestId('animated-bell')).not.toBeInTheDocument();

    vi.spyOn(button, 'matches').mockReturnValue(true);
    fireEvent.focus(button);
    expect(await screen.findByTestId('animated-bell')).toBeInTheDocument();
    expect(handle.startAnimation).toHaveBeenCalled();
  });

  it('does nothing for people who ask for reduced motion', () => {
    stubReducedMotion(true);
    render(<Host icon={<Bell className="size-4" />} />);

    fireEvent.mouseEnter(screen.getByRole('button'));

    expect(screen.queryByTestId('animated-bell')).not.toBeInTheDocument();
    expect(document.querySelector('svg.lucide-bell')).toBeInTheDocument();
  });

  it('hides the animated icon from assistive technology', async () => {
    render(<Host icon={<Bell className="size-4" />} />);

    fireEvent.mouseEnter(screen.getByRole('button'));

    expect(await screen.findByTestId('animated-bell')).toHaveAttribute(
      'aria-hidden',
      'true',
    );
  });

  it('loads the animated twin once idle, not in the first seconds, and before any hover', () => {
    vi.useFakeTimers();
    render(<Host icon={<Bell className="size-4" />} />);

    act(() => {
      vi.advanceTimersByTime(1_000);
    });
    expect(preloaded).toEqual([]);

    act(() => {
      vi.advanceTimersByTime(1_000);
    });
    expect(preloaded).toEqual([Bell]);
    expect(screen.queryByTestId('animated-bell')).not.toBeInTheDocument();
  });

  it('loads nothing for an icon without a twin', () => {
    vi.useFakeTimers();
    render(<Host icon={<Settings className="size-4" />} />);
    act(() => {
      vi.advanceTimersByTime(5_000);
    });

    expect(preloaded).toEqual([]);
  });

  it('loads nothing for people who ask for reduced motion', () => {
    vi.useFakeTimers();
    stubReducedMotion(true);
    render(<Host icon={<Bell className="size-4" />} />);
    act(() => {
      vi.advanceTimersByTime(5_000);
    });

    expect(preloaded).toEqual([]);
  });
});
