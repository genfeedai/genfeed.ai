import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import(
    '../../../tests/next-intl.stub'
  );

  return { useTranslations: translateFromCatalog };
});

vi.mock('@hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({
    href: (path: string) => `/acme/brand${path}`,
  }),
}));

vi.mock('@genfeedai/constants', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@genfeedai/constants')>();

  return {
    ...actual,
    APP_ROUTES: {
      ...actual.APP_ROUTES,
      WORKSPACE: {
        ...actual.APP_ROUTES.WORKSPACE,
        ACTIVITY: '/workspace/activity',
      },
    },
  };
});

import TopbarActivityMenu from './TopbarActivityMenu';

describe('TopbarActivityMenu', () => {
  it('opens a dropdown that links to workspace activity', async () => {
    const user = userEvent.setup();

    render(<TopbarActivityMenu />);

    await user.click(screen.getByRole('button', { name: 'Open activity' }));

    const activityLink = await screen.findByRole('menuitem', {
      name: 'Activity',
    });
    expect(activityLink).toHaveAttribute(
      'href',
      '/acme/brand/workspace/activity',
    );
  });
});
