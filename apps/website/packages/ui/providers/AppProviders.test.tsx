import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import AppProviders from './AppProviders';

const themeProviderMock = vi.fn();

const environment = vi.hoisted(() => ({ isProduction: true }));

vi.mock('@services/core/environment.service', () => ({
  EnvironmentService: environment,
}));

vi.mock('@ui/modals/system/error-debug/ModalErrorDebug', () => ({
  default: () => <div data-testid="error-debug-modal" />,
}));

vi.mock('next-themes', () => ({
  ThemeProvider: ({ children, ...props }: { children: ReactNode }) => {
    themeProviderMock(props);
    return <>{children}</>;
  },
  useTheme: () => ({ resolvedTheme: 'dark', theme: 'light' }),
}));

vi.mock('sonner', () => ({
  Toaster: ({ theme }: { theme: string }) => (
    <div data-testid="toaster" data-theme={theme} />
  ),
}));

describe('website AppProviders', () => {
  it('locks the marketing site to dark without reading the product theme store', () => {
    const { container } = render(
      <AppProviders includeLazyModalErrorDebug={false} includeToaster={false}>
        <div>Website child</div>
      </AppProviders>,
    );

    expect(screen.getByText('Website child')).toBeInTheDocument();
    expect(
      container.querySelector('#genfeed-theme-storage-bootstrap'),
    ).toBeNull();
    expect(themeProviderMock).toHaveBeenCalledWith(
      expect.objectContaining({
        defaultTheme: 'dark',
        enableSystem: false,
        forcedTheme: 'dark',
        storageKey: 'genfeed-website-theme',
      }),
    );
  });

  it('keeps notifications on the dark studio canvas', async () => {
    render(
      <AppProviders includeLazyModalErrorDebug={false}>
        <div>Notifications</div>
      </AppProviders>,
    );

    // The toaster is lazy: it mounts after hydration, off the first bundle.
    expect(await screen.findByTestId('toaster')).toHaveAttribute(
      'data-theme',
      'dark',
    );
  });

  it('keeps the Better Auth client out of every marketing page bundle', () => {
    const source = readFileSync(join(__dirname, 'AppProviders.tsx'), 'utf8');

    expect(source).not.toMatch(/from ['"]@genfeedai\/auth-client/);
  });

  it('skips the error debug modal in production, where it never opens', async () => {
    environment.isProduction = true;
    render(
      <AppProviders includeToaster={false}>
        <div>Page</div>
      </AppProviders>,
    );

    await screen.findByText('Page');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.queryByTestId('error-debug-modal')).not.toBeInTheDocument();
  });

  it('mounts the error debug modal outside production', async () => {
    environment.isProduction = false;
    render(
      <AppProviders includeToaster={false}>
        <div>Page</div>
      </AppProviders>,
    );

    expect(await screen.findByTestId('error-debug-modal')).toBeInTheDocument();
  });
});
