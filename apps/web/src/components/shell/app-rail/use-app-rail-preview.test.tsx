import { act, fireEvent, render, screen } from '@testing-library/react';
import { useRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppRailPreviewApp } from '@/props/ui/app-rail.props';
import { useAppRailPreview } from './use-app-rail-preview';

vi.mock('next/link', () => ({
  default: ({
    children,
    href,
    ...props
  }: {
    children: React.ReactNode;
    href: string;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock('./app-rail.previews', () => ({
  APP_RAIL_PREVIEWS: {
    library: () => <p>Library content</p>,
    publishing: () => <p>Publishing content</p>,
    workspace: () => <p>Workspace content</p>,
  },
}));

class ResizeObserverStub {
  observe = vi.fn();
  disconnect = vi.fn();
}

const APPS: AppRailPreviewApp[] = [
  {
    description: 'Your tasks',
    href: '/acme/workspace',
    id: 'workspace',
    label: 'Workspace',
    shortcut: '⌘ 1',
  },
  {
    description: 'Every asset',
    href: '/acme/library',
    id: 'library',
    label: 'Library',
    shortcut: '⌘ 2',
  },
  {
    description: 'Scheduled posts',
    href: '/acme/publishing',
    id: 'publishing',
    label: 'Publishing',
    shortcut: '⌘ 3',
  },
];

interface RailProps {
  activeAppId?: string;
  isEnabled?: boolean;
}

function Rail({ activeAppId = 'workspace', isEnabled = true }: RailProps) {
  const navRef = useRef<HTMLElement>(null);
  const preview = useAppRailPreview({
    activeAppId,
    apps: APPS,
    isEnabled,
    navRef,
  });

  return (
    <>
      <nav aria-label="Apps" ref={navRef} {...preview.navProps}>
        {APPS.map((app) => (
          <a data-app-rail-app={app.id} href={app.href} key={app.id}>
            {app.label}
          </a>
        ))}
      </nav>
      {preview.flyout}
    </>
  );
}

function hover(name: string, pointerType = 'mouse') {
  fireEvent.pointerOver(screen.getByRole('link', { name }), { pointerType });
}

function wait(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

describe('useAppRailPreview', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('ResizeObserver', ResizeObserverStub);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('opens the hovered app only after the hover-intent delay', () => {
    render(<Rail />);

    hover('Library');
    wait(100);
    expect(screen.queryByTestId('app-rail-preview')).toBeNull();

    wait(200);
    expect(screen.getByTestId('app-rail-preview')).toHaveTextContent(
      'Library content',
    );
    expect(screen.getByTestId('app-rail-preview-open-library')).toHaveAttribute(
      'href',
      '/acme/library',
    );
  });

  it('shows the label, description and shortcut in the preview header', () => {
    render(<Rail />);

    hover('Library');
    wait(300);

    const header = screen.getByTestId('app-rail-preview-open-library');
    expect(header).toHaveTextContent('Library');
    expect(header).toHaveTextContent('Every asset');
    expect(header).toHaveTextContent('⌘ 2');
  });

  it('never previews the active app', () => {
    render(<Rail activeAppId="library" />);

    hover('Library');
    wait(600);

    expect(screen.queryByTestId('app-rail-preview')).toBeNull();
  });

  it('swaps to the next app at once when moving between icons', () => {
    render(<Rail />);
    hover('Library');
    wait(300);

    hover('Publishing');

    expect(screen.getAllByTestId('app-rail-preview')).toHaveLength(1);
    expect(screen.getByTestId('app-rail-preview')).toHaveTextContent(
      'Publishing content',
    );
  });

  it('closes shortly after the pointer leaves, unless it enters the preview', () => {
    render(<Rail />);
    hover('Library');
    wait(300);

    fireEvent.pointerLeave(screen.getByRole('navigation', { name: 'Apps' }));
    fireEvent.pointerEnter(screen.getByTestId('app-rail-preview'));
    wait(500);
    expect(screen.getByTestId('app-rail-preview')).toBeInTheDocument();

    fireEvent.pointerLeave(screen.getByTestId('app-rail-preview'));
    wait(200);
    expect(screen.queryByTestId('app-rail-preview')).toBeNull();
  });

  it('closes on Escape', () => {
    render(<Rail />);
    hover('Library');
    wait(300);

    fireEvent.keyDown(window, { key: 'Escape' });

    expect(screen.queryByTestId('app-rail-preview')).toBeNull();
  });

  it('closes when the app being previewed becomes the active one', () => {
    const { rerender } = render(<Rail />);
    hover('Library');
    wait(300);

    rerender(<Rail activeAppId="library" />);

    expect(screen.queryByTestId('app-rail-preview')).toBeNull();
  });

  it('ignores touch pointers', () => {
    render(<Rail />);

    hover('Library', 'touch');
    wait(600);

    expect(screen.queryByTestId('app-rail-preview')).toBeNull();
  });

  it('opens nothing while previews are disabled', () => {
    render(<Rail isEnabled={false} />);

    hover('Library');
    wait(600);

    expect(screen.queryByTestId('app-rail-preview')).toBeNull();
  });
});
