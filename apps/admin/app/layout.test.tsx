import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

const appProvidersSpy = vi.fn();

vi.mock('@styles/globals.scss', () => ({}));

vi.mock('@genfeedai/fonts', () => ({
  fontVariables: 'font-vars',
}));

vi.mock('@helpers/media/metadata/metadata.helper', () => ({
  metadata: {
    description: 'Genfeed description',
    name: 'Genfeed',
  },
}));

vi.mock('@helpers/ui/theme/theme.helper', () => ({
  resolveRequestTheme: vi.fn().mockResolvedValue('dark'),
}));

vi.mock('@ui/providers/AppProviders', () => ({
  default: ({
    children,
    ...props
  }: {
    children: ReactNode;
    clerkProps?: Record<string, unknown>;
    initialTheme: string;
  }) => {
    appProvidersSpy(props);
    return <div data-testid="admin-app-providers">{children}</div>;
  },
}));

vi.mock('@components/shell/AppHtmlDocument', () => ({
  default: ({ children }: { children: ReactNode }) => (
    <div data-testid="admin-app-html-document">{children}</div>
  ),
}));

vi.mock('@components/shell/metadata', () => ({
  createAppMetadata: vi.fn(() => ({})),
}));

describe('admin root layout', () => {
  it('boots the admin app with a single root AppProviders wrapper', async () => {
    const { default: RootLayout } = await import('./layout');

    render(
      await RootLayout({
        children: <div>Admin child</div>,
      } as never),
    );

    expect(screen.getByText('Admin child')).toBeInTheDocument();
    expect(appProvidersSpy).toHaveBeenCalledTimes(1);
    expect(appProvidersSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        clerkProps: {
          signInUrl: '/login',
        },
        initialTheme: 'dark',
      }),
    );
  });
});
