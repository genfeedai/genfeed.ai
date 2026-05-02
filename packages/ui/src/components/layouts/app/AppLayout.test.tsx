import type { TopbarProps } from '@genfeedai/props/navigation/topbar.props';
import { render, screen } from '@testing-library/react';
import AppLayout from '@ui/layouts/app/AppLayout';
import type { ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';

function MenuComponent(): ReactElement {
  return <div data-testid="menu-component">Menu</div>;
}

describe('AppLayout', () => {
  it('renders layout shell', () => {
    render(
      <AppLayout>
        <div>Content</div>
      </AppLayout>,
    );

    const contentShell = screen.getByTestId('app-content-shell');
    const mainContent = screen.getByTestId('app-main-content');

    expect(contentShell).toBeInTheDocument();
    expect(mainContent).toBeInTheDocument();
    expect(contentShell).toHaveClass(
      'relative',
      'min-h-screen',
      'bg-background',
    );
    expect(contentShell).toHaveClass(
      'md:pl-[var(--desktop-sidebar-width)]',
      'lg:pb-[var(--desktop-agent-height)]',
    );
    expect(mainContent).not.toHaveClass('overflow-y-auto');
    expect(screen.getByText('Content')).toBeInTheDocument();
  });

  it('renders a shell banner before page content inside the main region', () => {
    render(
      <AppLayout bannerComponent={<div data-testid="shell-banner">Banner</div>}>
        <div data-testid="page-content">Content</div>
      </AppLayout>,
    );

    const mainContent = screen.getByTestId('app-main-content');
    const bannerShell = screen.getByTestId('app-banner-shell');
    const pageContent = screen.getByTestId('page-content');

    expect(bannerShell).toBeInTheDocument();
    expect(
      bannerShell.compareDocumentPosition(pageContent) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(mainContent.firstElementChild).toBe(bannerShell);
  });

  it('uses document scrolling instead of trapping vertical overflow in the center shell', () => {
    render(
      <AppLayout agentPanel={<div>Agent panel</div>}>
        <div>Content</div>
      </AppLayout>,
    );

    const layoutRoot = screen.getByTestId('app-content-shell').parentElement;
    const contentShell = screen.getByTestId('app-content-shell');
    const agentRail = screen.getByTestId('agent-panel-rail');

    expect(layoutRoot).toHaveClass(
      'min-h-screen',
      'overflow-x-hidden',
      'bg-background',
    );
    expect(layoutRoot).not.toHaveClass('h-screen', 'overflow-hidden');
    expect(contentShell).not.toHaveClass(
      'overflow-y-auto',
      'min-h-0',
      'flex',
      'flex-col',
    );
    expect(agentRail).toHaveClass('fixed', 'bottom-0', 'left-0', 'right-0');
  });

  it('renders a distinct left rail when a menu component is provided', () => {
    render(
      <AppLayout menuComponent={<MenuComponent />}>
        <div>Content</div>
      </AppLayout>,
    );

    const rail = screen.getByTestId('desktop-sidebar-rail');
    expect(rail).toBeInTheDocument();
    expect(rail).not.toHaveClass('border-r');
    expect(rail).toHaveClass('bg-transparent');
    expect(rail).toHaveClass('fixed', 'bottom-0', 'left-0');
    expect(rail).toHaveStyle({ top: 'var(--desktop-titlebar-height)' });
    expect(screen.getAllByTestId('menu-component')).toHaveLength(2);
  });

  it('keeps the desktop rail transparent when the shell variant is transparent', () => {
    render(
      <AppLayout
        menuComponent={<MenuComponent />}
        shellChromeVariant="transparent"
      >
        <div>Content</div>
      </AppLayout>,
    );

    const rail = screen.getByTestId('desktop-sidebar-rail');

    expect(rail).toHaveClass('bg-transparent');
    expect(rail).not.toHaveClass('border-r');
    expect(rail).not.toHaveClass('bg-background-secondary');
  });

  it('renders agent dock and fixed-height shell when agent panel is provided', () => {
    render(
      <AppLayout agentPanel={<div>Agent panel</div>} isAgentCollapsed={false}>
        <div>Content</div>
      </AppLayout>,
    );

    const rail = screen.getByTestId('agent-panel-rail');
    const shell = screen.getByTestId('agent-panel-shell');

    expect(rail).toHaveStyle({ minHeight: '380px', height: '380px' });
    expect(shell).toHaveStyle({ minHeight: '380px', height: '380px' });
    expect(shell).toHaveClass('absolute', 'bottom-0', 'inset-x-0');
    expect(rail).toHaveClass('fixed', 'bottom-0', 'left-0', 'right-0');
    expect(screen.getByTestId('agent-panel-resize-handle')).toBeInTheDocument();
  });

  it('does not render the bottom agent rail while collapsed', () => {
    render(
      <AppLayout agentPanel={<div>Agent panel</div>} isAgentCollapsed>
        <div>Content</div>
      </AppLayout>,
    );

    expect(screen.queryByTestId('agent-panel-rail')).not.toBeInTheDocument();
    expect(screen.getByTestId('app-content-shell').parentElement).toHaveStyle({
      '--desktop-agent-height': '0px',
    });
  });

  it('keeps the collapsed agent rail hidden in transparent shell mode', () => {
    render(
      <AppLayout
        agentPanel={<div>Agent panel</div>}
        isAgentCollapsed
        shellChromeVariant="transparent"
      >
        <div>Content</div>
      </AppLayout>,
    );

    expect(screen.queryByTestId('agent-panel-rail')).not.toBeInTheDocument();
  });

  it('shows the agent dock border in transparent shell mode when expanded', () => {
    render(
      <AppLayout
        agentPanel={<div>Agent panel</div>}
        shellChromeVariant="transparent"
      >
        <div>Content</div>
      </AppLayout>,
    );

    const rail = screen.getByTestId('agent-panel-rail');

    expect(rail).toHaveClass('bg-transparent', 'shadow-none');
  });

  it('passes agent toggle to topbar when agent rail is mounted', () => {
    let capturedProps: TopbarProps | undefined;
    const TopbarMock = (props: TopbarProps) => {
      capturedProps = props;
      return <div data-testid="topbar-mock" />;
    };

    const toggle = vi.fn();

    render(
      <AppLayout
        topbarComponent={TopbarMock}
        agentPanel={<div>Agent panel</div>}
        isAgentCollapsed
        onAgentToggle={toggle}
      >
        <div>Content</div>
      </AppLayout>,
    );

    expect(screen.getByTestId('topbar-mock')).toBeInTheDocument();
    expect(capturedProps?.onAgentToggle).toBe(toggle);
  });

  it('does not pass the terminal toggle to topbar without an agent rail', () => {
    let capturedProps: TopbarProps | undefined;
    const TopbarMock = (props: TopbarProps) => {
      capturedProps = props;
      return <div data-testid="topbar-mock" />;
    };

    render(
      <AppLayout topbarComponent={TopbarMock} onAgentToggle={vi.fn()}>
        <div>Content</div>
      </AppLayout>,
    );

    expect(screen.getByTestId('topbar-mock')).toBeInTheDocument();
    expect(capturedProps?.onAgentToggle).toBeUndefined();
  });

  it('keeps default topbar chrome styling', () => {
    const TopbarMock = () => <div data-testid="topbar-mock" />;

    render(
      <AppLayout topbarComponent={TopbarMock}>
        <div>Content</div>
      </AppLayout>,
    );

    expect(screen.getByTestId('app-topbar-shell')).toHaveClass('bg-background');
    expect(screen.getByTestId('app-topbar-shell')).not.toHaveClass('border-b');
  });

  it('does not offset the topbar for the collapsed bottom dock', () => {
    const TopbarMock = () => <div data-testid="topbar-mock" />;

    render(
      <AppLayout
        topbarComponent={TopbarMock}
        agentPanel={<div>Agent panel</div>}
        isAgentCollapsed
      >
        <div>Content</div>
      </AppLayout>,
    );

    expect(screen.getByTestId('app-topbar-shell')).not.toHaveClass(
      'lg:right-[var(--desktop-agent-width)]',
    );
    expect(screen.getByTestId('app-content-shell').parentElement).toHaveStyle({
      '--desktop-agent-height': '0px',
    });
  });

  it('removes visible topbar chrome styling for transparent shell variant', () => {
    const TopbarMock = () => <div data-testid="topbar-mock" />;

    render(
      <AppLayout topbarComponent={TopbarMock} shellChromeVariant="transparent">
        <div>Content</div>
      </AppLayout>,
    );

    const topbarShell = screen.getByTestId('app-topbar-shell');

    expect(topbarShell).toHaveClass(
      'h-12',
      'fixed',
      'top-0',
      'left-0',
      'right-0',
      'z-50',
    );
    expect(topbarShell).not.toHaveClass(
      'border-b',
      'border-border',
      'bg-background',
    );
  });

  it('renders topbar chrome when transparent shell is overridden to default', () => {
    const TopbarMock = () => <div data-testid="topbar-mock" />;

    render(
      <AppLayout
        topbarComponent={TopbarMock}
        shellChromeVariant="transparent"
        topbarChromeVariant="default"
      >
        <div>Content</div>
      </AppLayout>,
    );

    expect(screen.getByTestId('app-topbar-shell')).toHaveClass('bg-background');
    expect(screen.getByTestId('app-topbar-shell')).not.toHaveClass('border-b');
  });

  it('keeps topbar chrome when a secondary topbar is present', () => {
    const TopbarMock = () => <div data-testid="topbar-mock" />;

    render(
      <AppLayout
        topbarComponent={TopbarMock}
        topbarChromeVariant="default"
        hasSecondaryTopbar
      >
        <div>Content</div>
      </AppLayout>,
    );

    expect(screen.getByTestId('app-topbar-shell')).toHaveClass('bg-background');
    expect(screen.getByTestId('app-topbar-shell')).not.toHaveClass('border-b');
  });

  it('keeps topbar borderless when transparent override is explicit', () => {
    const TopbarMock = () => <div data-testid="topbar-mock" />;

    render(
      <AppLayout topbarComponent={TopbarMock} topbarChromeVariant="transparent">
        <div>Content</div>
      </AppLayout>,
    );

    const topbarShell = screen.getByTestId('app-topbar-shell');

    expect(topbarShell).not.toHaveClass(
      'border-b',
      'border-border',
      'bg-background',
    );
  });
});
