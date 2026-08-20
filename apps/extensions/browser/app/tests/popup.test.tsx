import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockUseAuth, mockAuthService, mockGetJWTToken } = vi.hoisted(() => ({
  mockAuthService: {
    clearToken: vi.fn(),
    getToken: vi.fn(),
    setToken: vi.fn(),
  },
  mockGetJWTToken: vi.fn(),
  mockUseAuth: vi.fn(),
}));

vi.mock('@genfeedai/auth-client/react', () => ({
  useAuth: () => mockUseAuth(),
}));

vi.mock('~services/auth.service', () => ({
  authService: mockAuthService,
  getJWTToken: (...args: unknown[]) => mockGetJWTToken(...args),
}));

vi.mock('~components/pages/LoginPage', () => ({
  default: () => React.createElement('div', null, 'Login Page'),
}));

vi.mock('~style.css', () => ({}));

vi.mock('next/image', () => ({
  default: (props: Record<string, unknown>) =>
    React.createElement('img', props),
}));

import IndexPopup from '../src/popup';

describe('IndexPopup', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockUseAuth.mockReturnValue({
      getToken: vi.fn(),
      isLoaded: true,
      isSignedIn: false,
      signOut: vi.fn(),
    });

    mockAuthService.getToken.mockResolvedValue(null);
    mockGetJWTToken.mockResolvedValue(null);
    vi.mocked(chrome.storage.local.get).mockResolvedValue({});
  });

  it('renders without throwing', () => {
    expect(() => render(React.createElement(IndexPopup))).not.toThrow();
  });

  it('renders the brand logo from the canonical CDN', async () => {
    render(React.createElement(IndexPopup));

    await waitFor(() => {
      expect(screen.getByAltText('Genfeed')).toBeInTheDocument();
    });

    // The popup reads the real environment service. Before `logoURL` existed
    // there, `src` was undefined; the value it now resolves to must be the
    // live CDN asset and never the dead `assets.genfeed.ai` host.
    const logo = screen.getByAltText('Genfeed');
    expect(logo.getAttribute('src')).toContain(
      'cdn.genfeed.ai/assets/branding/logo.svg',
    );
    expect(logo.getAttribute('src')).not.toContain('assets.genfeed.ai/');
  });

  it('shows loading state while auth is loading', () => {
    mockUseAuth.mockReturnValue({
      getToken: vi.fn(),
      isLoaded: false,
      isSignedIn: false,
      signOut: vi.fn(),
    });

    render(React.createElement(IndexPopup));

    expect(screen.getByLabelText('Loading')).toBeInTheDocument();
  });

  it('shows login page when not authenticated', async () => {
    render(React.createElement(IndexPopup));

    await waitFor(() => {
      expect(screen.getByText('Login Page')).toBeInTheDocument();
    });
  });

  it('shows side panel CTA when token exists', async () => {
    mockAuthService.getToken.mockResolvedValue('existing-token');

    render(React.createElement(IndexPopup));

    await waitFor(() => {
      expect(screen.getByText('Open Side Panel')).toBeInTheDocument();
    });
  });

  it('syncs token from Better Auth when signed in and no local token', async () => {
    mockUseAuth.mockReturnValue({
      getToken: vi.fn().mockResolvedValue('better-auth-token'),
      isLoaded: true,
      isSignedIn: true,
      signOut: vi.fn(),
    });

    mockGetJWTToken.mockResolvedValue('new-jwt-token');

    render(React.createElement(IndexPopup));

    await waitFor(() => {
      expect(mockGetJWTToken).toHaveBeenCalled();
      expect(mockAuthService.setToken).toHaveBeenCalledWith('new-jwt-token');
    });
  });

  it('handles logout action', async () => {
    const signOut = vi.fn();

    mockUseAuth.mockReturnValue({
      getToken: vi.fn().mockResolvedValue('better-auth-token'),
      isLoaded: true,
      isSignedIn: true,
      signOut,
    });

    mockAuthService.getToken.mockResolvedValue('existing-token');

    render(React.createElement(IndexPopup));

    await waitFor(() => {
      expect(screen.getByText('Logout')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Logout'));

    await waitFor(() => {
      expect(signOut).toHaveBeenCalled();
      expect(mockAuthService.clearToken).toHaveBeenCalled();
    });
  });

  it('follows the system color scheme on mount', async () => {
    vi.mocked(chrome.storage.local.get).mockResolvedValue({});
    render(React.createElement(IndexPopup));

    await waitFor(() => {
      expect(document.documentElement.classList.contains('dark')).toBe(false);
      expect(document.documentElement.getAttribute('data-theme')).toBe('light');
      expect(document.body.classList.contains('dark')).toBe(false);
    });
  });
});
