import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  workspace: {
    status: 'ready',
    snapshot: {
      userId: 'user-1',
      organizationLabel: 'Demo',
      brandId: 'brand-1',
      brands: [{ id: 'brand-1', label: 'Vincent' }],
    },
  } as unknown,
  reload: vi.fn().mockResolvedValue(undefined),
  clear: vi.fn(),
  signOut: vi.fn(),
  isLoaded: true,
}));
vi.mock('~hooks/use-workspace', () => ({
  useWorkspace: () => mocks.workspace,
}));
vi.mock('~services/workspace.service', () => ({ loadWorkspace: mocks.reload }));
vi.mock('@genfeedai/auth-client/react', () => ({
  useAuth: () => ({ isLoaded: mocks.isLoaded, signOut: mocks.signOut }),
}));
vi.mock('~services/auth.service', () => ({
  authService: { clearToken: mocks.clear },
}));
vi.mock('~hooks/use-extension-theme', () => ({
  useExtensionTheme: () => true,
}));
vi.mock('~hooks/use-account-theme-sync', () => ({
  useAccountThemeSync: vi.fn(),
}));
vi.mock('~components/pages/LoginPage', () => ({
  default: () => <div>Login Page</div>,
}));
vi.mock('~style.css', () => ({}));
vi.mock('next/image', () => ({
  default: (props: Record<string, unknown>) => (
    <img {...props} alt={String(props.alt ?? '')} />
  ),
}));

import Popup from '../src/popup';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.isLoaded = true;
  mocks.workspace = {
    status: 'ready',
    snapshot: {
      userId: 'user-1',
      organizationLabel: 'Demo',
      brandId: 'brand-1',
      brands: [{ id: 'brand-1', label: 'Vincent' }],
    },
  };
});
describe('verified popup workspace', () => {
  it('displays verified account and workspace with the side panel CTA', () => {
    render(<Popup />);
    expect(screen.getByText(/Demo · Vincent · user-1/)).toBeInTheDocument();
    expect(screen.getByText('Open Side Panel')).toBeInTheDocument();
  });
  it('uses the canonical CDN logo', () => {
    render(<Popup />);
    expect(screen.getByAltText('Genfeed').getAttribute('src')).toContain(
      'cdn.genfeed.ai/assets/branding/logo.svg',
    );
  });
  it('shows loading before verified identity is available', () => {
    mocks.workspace = { status: 'loading' };
    render(<Popup />);
    expect(screen.getByLabelText('Loading')).toBeInTheDocument();
    expect(screen.queryByText('Open Side Panel')).not.toBeInTheDocument();
  });
  it('keeps the verified popup visible while the workspace is refreshing', () => {
    mocks.workspace = {
      status: 'refreshing',
      snapshot: {
        userId: 'user-1',
        organizationLabel: 'Demo',
        brandId: 'brand-1',
        brands: [{ id: 'brand-1', label: 'Vincent' }],
      },
    };
    render(<Popup />);
    expect(screen.getByText('Open Side Panel')).toBeInTheDocument();
    expect(screen.queryByText('Login Page')).not.toBeInTheDocument();
  });
  it('shows the actual blocked error with Retry and Open Genfeed', async () => {
    mocks.workspace = { status: 'blocked', error: 'HTTP 503. Retry.' };
    render(<Popup />);
    expect(screen.getByRole('alert')).toHaveTextContent('503');
    fireEvent.click(screen.getByText('Retry'));
    await waitFor(() =>
      expect(mocks.reload).toHaveBeenCalledWith({ forceRefresh: true }),
    );
  });
  it('signs out and clears the shared credential before verified reload', async () => {
    render(<Popup />);
    fireEvent.click(screen.getByText('Logout'));
    await waitFor(() => expect(mocks.clear).toHaveBeenCalled());
    expect(mocks.signOut).toHaveBeenCalled();
    expect(mocks.reload).toHaveBeenCalled();
  });
});
