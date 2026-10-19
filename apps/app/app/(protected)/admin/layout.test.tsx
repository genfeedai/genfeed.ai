import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const isProtectedBootstrapBypassedMock = vi.fn();
const loadServerSuperAdminMock = vi.fn();
const notFoundMock = vi.fn(() => {
  throw new Error('NEXT_NOT_FOUND');
});

vi.mock('@app-server/protected-bootstrap.server', () => ({
  isProtectedBootstrapBypassed: isProtectedBootstrapBypassedMock,
  loadServerSuperAdmin: loadServerSuperAdminMock,
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  notFound: notFoundMock,
}));

describe('app/(protected)/admin/layout.tsx', () => {
  it('guards the entire admin subtree behind platform superadmin access', () => {
    const source = readFileSync(
      join(process.cwd(), 'app/(protected)/admin/layout.tsx'),
      'utf8',
    );

    expect(source).toContain('loadServerSuperAdmin');
    expect(source).toContain('isProtectedBootstrapBypassed');
    expect(source).toContain('notFound()');

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
    notFoundMock.mockImplementation(() => {
      throw new Error('NEXT_NOT_FOUND');
    });
  });

  it('returns children when the trusted Playwright bootstrap bypass is active', async () => {
    isProtectedBootstrapBypassedMock.mockResolvedValue(true);
    const AdminLayout = (await import('./layout')).default;

    await expect(AdminLayout({ children })).resolves.toMatchObject({
      props: { children: expect.arrayContaining([children]) },
    });
    expect(loadServerSuperAdminMock).not.toHaveBeenCalled();
    expect(notFoundMock).not.toHaveBeenCalled();
  });

  it('404s a non-superadmin when the Playwright bypass is off', async () => {
    isProtectedBootstrapBypassedMock.mockResolvedValue(false);
    loadServerSuperAdminMock.mockResolvedValue(false);
    const AdminLayout = (await import('./layout')).default;

    await expect(AdminLayout({ children })).rejects.toThrow('NEXT_NOT_FOUND');
    expect(loadServerSuperAdminMock).toHaveBeenCalledTimes(1);
    expect(notFoundMock).toHaveBeenCalledTimes(1);
  });

  it('renders admin children for a superadmin when the Playwright bypass is off', async () => {
    isProtectedBootstrapBypassedMock.mockResolvedValue(false);
    loadServerSuperAdminMock.mockResolvedValue(true);
    const AdminLayout = (await import('./layout')).default;

    await expect(AdminLayout({ children })).resolves.toMatchObject({
      props: { children: expect.arrayContaining([children]) },
    });
    expect(notFoundMock).not.toHaveBeenCalled();
  });
});
