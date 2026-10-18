import AppIntlProvider from '@app-i18n/AppIntlProvider';
import { runPageModuleTests } from '@shared/pages/pageTestUtils';
import { render, screen } from '@testing-library/react';
import { useTranslations } from 'next-intl';
import { beforeEach, expect, vi } from 'vitest';
import pages from '../../messages/en/pages';
import ProtectedRootPage, * as PageModule from './page';

const mocks = vi.hoisted(() => ({
  betterAuthEnabled: true,
}));

vi.mock('@app/(protected)/root-resolver-client', () => ({
  default: () => <div data-testid="protected-root-resolver" />,
}));

vi.mock('@app/(protected)/home/content', () => ({
  default: () => {
    const t = useTranslations('pages.posts.list');
    return <main data-testid="operational-home">{t('loadError')}</main>;
  },
}));

vi.mock('@genfeedai/auth-client/server', () => ({
  isBetterAuthEnabled: () => mocks.betterAuthEnabled,
}));

runPageModuleTests('app/(protected)/page', PageModule);

describe('ProtectedRootPage', () => {
  beforeEach(() => {
    mocks.betterAuthEnabled = true;
  });

  it('renders the authenticated protected root resolver', () => {
    render(
      <AppIntlProvider locale="en">
        <ProtectedRootPage />
      </AppIntlProvider>,
    );

    expect(screen.getByTestId('protected-root-resolver')).toBeInTheDocument();
  });

  it('renders operational home directly in keyless deployment modes', () => {
    mocks.betterAuthEnabled = false;

    render(
      <AppIntlProvider locale="en">
        <ProtectedRootPage />
      </AppIntlProvider>,
    );

    expect(screen.getByTestId('operational-home')).toHaveTextContent(
      pages.posts.list.loadError,
    );
  });
});
