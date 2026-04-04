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

vi.mock('@clerk/chrome-extension', () => ({
  ClerkProvider: ({ children }: { children: React.ReactNode }) => children,
  useAuth: () => mockUseAuth(),
}));

vi.mock('~services/auth.service', () => ({
  authService: mockAuthService,
  getJWTToken: (...args: unknown[]) => mockGetJWTToken(...args),
}));

vi.mock('~components/pages/LoginPage', () => ({
  default: () => React.createElement('div', null, 'Login Page'),
}));

vi.mock('~style.scss', () => ({}));

vi.mock('~services', () => ({
  EnvironmentService: {
    logoURL: 'https://assets.genfeed.ai/branding/logo.svg',
  },
}));

import IndexPopup from '../src/popup';

describe('IndexPopup', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    process.env.PLASMO_PUBLIC_CLERK_PUBLISHABLE_KEY = 'pk_test_mock';

    mockUseAuth.mockReturnValue({
      getToken: vi.fn(),
      isLoaded: true,
      isSignedIn: false,
      signOut: vi.fn(),
    });

    mockAuthService.getToken.mockResolvedValue(null);
    mockGetJWTToken.mockResolvedValue(null);
  });

  it('renders without throwing', () => {
    expect(() => render(React.createElement(IndexPopup))).not.toThrow();
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

  it('syncs token from Clerk when signed in and no local token', async () => {
    mockUseAuth.mockReturnValue({
      getToken: vi.fn().mockResolvedValue('clerk-token'),
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
      getToken: vi.fn().mockResolvedValue('clerk-token'),
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

  it('sets dark mode attributes on mount', () => {
    render(React.createElement(IndexPopup));

    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(document.body.classList.contains('dark')).toBe(true);
  });
});
