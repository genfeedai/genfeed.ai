import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const isProtectedBootstrapBypassedMock = vi.fn();
const loadServerSuperAdminMock = vi.fn();
const isPlaywrightAdminDeniedMock = vi.fn();
const redirectMock = vi.fn((_path: string) => {
  throw new Error('NEXT_REDIRECT');
});

vi.mock('@/server/protected-bootstrap.server', () => ({
  isPlaywrightAdminDenied: isPlaywrightAdminDeniedMock,
  isProtectedBootstrapBypassed: isProtectedBootstrapBypassedMock,
  loadServerSuperAdmin: loadServerSuperAdminMock,
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  redirect: redirectMock,
}));

describe('app/(protected)/admin/layout.tsx', () => {
  it('guards the entire admin subtree behind platform superadmin access', () => {
    const source = readFileSync(
      join(process.cwd(), 'app/(protected)/admin/layout.tsx'),
      'utf8',
    );

    expect(source).toContain('loadServerSuperAdmin');
    expect(source).toContain('isProtectedBootstrapBypassed');
    expect(source).toContain('redirect(APP_ROUTES.ROOT)');
    expect(source).not.toContain('notFound');

    // Self-host / local Portless superadmins must reach admin too. The guard's
    // doc comment names `isSaaS` deliberately, so assert against code only.
    const code = source
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/[^\n]*/g, '');
    expect(code).not.toContain('isSaaS');
  });
});

describe('AdminLayout authorization', () => {
  const children = 'admin-children';

  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    isPlaywrightAdminDeniedMock.mockResolvedValue(false);
    redirectMock.mockImplementation(() => {
      throw new Error('NEXT_REDIRECT');
    });
  });

  it('returns children when the trusted Playwright bootstrap bypass is active', async () => {
    isProtectedBootstrapBypassedMock.mockResolvedValue(true);
    const AdminLayout = (await import('./layout')).default;

    await expect(AdminLayout({ children })).resolves.toMatchObject({
      props: { children: expect.arrayContaining([children]) },
    });
    expect(loadServerSuperAdminMock).not.toHaveBeenCalled();
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it('redirects a non-superadmin to the app root when the Playwright bypass is off', async () => {
    isProtectedBootstrapBypassedMock.mockResolvedValue(false);
    loadServerSuperAdminMock.mockResolvedValue(false);
    const AdminLayout = (await import('./layout')).default;

    await expect(AdminLayout({ children })).rejects.toThrow('NEXT_REDIRECT');
    expect(loadServerSuperAdminMock).toHaveBeenCalledTimes(1);
    expect(redirectMock).toHaveBeenCalledWith('/');
  });

  it('redirects a Playwright visitor flagged as not an admin', async () => {
    isProtectedBootstrapBypassedMock.mockResolvedValue(true);
    isPlaywrightAdminDeniedMock.mockResolvedValue(true);
    const AdminLayout = (await import('./layout')).default;

    await expect(AdminLayout({ children })).rejects.toThrow('NEXT_REDIRECT');
    expect(loadServerSuperAdminMock).not.toHaveBeenCalled();
    expect(redirectMock).toHaveBeenCalledWith('/');
  });

  it('renders admin children for a superadmin when the Playwright bypass is off', async () => {
    isProtectedBootstrapBypassedMock.mockResolvedValue(false);
    loadServerSuperAdminMock.mockResolvedValue(true);
    const AdminLayout = (await import('./layout')).default;

    await expect(AdminLayout({ children })).resolves.toMatchObject({
      props: { children: expect.arrayContaining([children]) },
    });
    expect(redirectMock).not.toHaveBeenCalled();
  });
});
