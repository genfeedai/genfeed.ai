import '@testing-library/jest-dom/vitest';
import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import DesktopDragStrip from './DesktopDragStrip';

const pathnameMock = vi.hoisted(() => ({ current: '/' }));
const desktopClientMock = vi.hoisted(() => ({ current: true }));

vi.mock('next/navigation', () => ({
  usePathname: () => pathnameMock.current,
}));

vi.mock('@genfeedai/config/deployment', () => ({
  isDesktopClient: () => desktopClientMock.current,
}));

describe('DesktopDragStrip', () => {
  beforeEach(() => {
    pathnameMock.current = '/';
    desktopClientMock.current = true;
    vi.stubGlobal('navigator', {
      platform: 'MacIntel',
      userAgentData: { platform: 'macOS' },
    });
  });

  it('hides the drag strip on desktop login so auth is full-bleed', () => {
    pathnameMock.current = '/login';
    render(<DesktopDragStrip />);
    expect(document.querySelector('[data-desktop-drag="true"]')).toBeNull();
  });

  it('hides the drag strip on nested auth routes', () => {
    pathnameMock.current = '/login/password';
    render(<DesktopDragStrip />);
    expect(document.querySelector('[data-desktop-drag="true"]')).toBeNull();
  });

  it('keeps the drag strip after sign-in', () => {
    pathnameMock.current = '/acme/studio/generate';
    render(<DesktopDragStrip />);
    expect(document.querySelector('[data-desktop-drag="true"]')).not.toBeNull();
  });

  it('does not render in the browser app', () => {
    desktopClientMock.current = false;
    pathnameMock.current = '/acme/studio/generate';
    render(<DesktopDragStrip />);
    expect(document.querySelector('[data-desktop-drag="true"]')).toBeNull();
  });
});
