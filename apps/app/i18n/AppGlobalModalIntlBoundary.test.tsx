import OrganizationAutomationBrandEmptyState from '@app/(protected)/[orgSlug]/~/automation/OrganizationAutomationBrandEmptyState';
import type { GlobalModalKind } from '@genfeedai/props/modals/global-modals.props';
import { cleanup, render, screen } from '@testing-library/react';
import AnalyticsMetricInfo from '@ui/analytics/metric-definition/AnalyticsMetricInfo';
import { ErrorFallback } from '@ui/error/ErrorFallback';
import {
  NextIntlClientProvider,
  useMessages,
  useTranslations,
} from 'next-intl';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import common from '../messages/en/common.json';
import pages from '../messages/en/pages';
import AppGlobalModalIntlBoundary, {
  renderAppGlobalModal,
  resolveModalCatalogScope,
} from './AppGlobalModalIntlBoundary';
import AppIntlProvider from './AppIntlProvider';
import AppPageIntlProvider from './AppPageIntlProvider';
import protectedMessages from './page-scopes/protected';

const navigation = vi.hoisted(() => ({
  pathname: '/acme/brand/library/assets',
}));
vi.mock('next/navigation', () => ({ usePathname: () => navigation.pathname }));

const CASES = [
  {
    pathname: '/',
    id: 'posts.list.loadError',
    value: pages.posts.list.loadError,
  },
  {
    pathname: '/acme/brand/workspace/overview',
    id: 'workspaceOverview.noActiveTasks',
    value: pages.workspaceOverview.noActiveTasks,
  },
  {
    pathname: '/acme/brand/analytics/overview',
    id: 'analytics.trendTurnover.heading',
    value: pages.analytics.trendTurnover.heading,
  },
  {
    pathname: '/acme/brand/library/assets',
    id: 'library.emptyOpenPlayground',
    value: pages.library.emptyOpenPlayground,
  },
  {
    pathname: '/acme/brand/publishing/posts',
    id: 'posts.list.loadError',
    value: pages.posts.list.loadError,
  },
  {
    pathname: '/acme/brand/settings/social-media',
    id: 'brandSocialMedia.accountDisconnected',
    value: pages.brandSocialMedia.accountDisconnected,
  },
  {
    pathname: '/acme/~/settings/identity',
    id: 'identityDefaults.organizationLabel',
    value: pages.identityDefaults.organizationLabel,
  },
  {
    pathname: '/settings/about',
    id: 'about.apiReference',
    value: pages.about.apiReference,
  },
  {
    pathname: '/acme/brand/studio/playground',
    id: 'studioPlayground.editImage.fluxResolution',
    value: pages.studioPlayground.editImage.fluxResolution,
  },
  {
    pathname: '/onboarding/brand',
    id: 'onboarding.brand.scan.title',
    value: pages.onboarding.brand.scan.title,
  },
] as const;

type MessageId = (typeof CASES)[number]['id'];

interface ProbeProps {
  id: MessageId;
  onMessages?: (messages: ReturnType<typeof useMessages>) => void;
}

function Probe({ id, onMessages }: ProbeProps) {
  const messages = useMessages();
  onMessages?.(messages);
  const translate = useTranslations('pages');
  const common = useTranslations('common.actions');
  const help = useTranslations('pages.help');
  return (
    <>
      <span>{translate(id)}</span>
      <span>{common('save')}</span>
      <span>{help('workspaceOverview.title')}</span>
    </>
  );
}

function UnavailableShellProbe() {
  const platform = useTranslations('pages.platformFlags.unavailable');
  const landing = useTranslations('pages.organizationLanding');
  const routing = useTranslations('pages.organizationRouting');
  return (
    <>
      <ErrorFallback
        title={platform('title')}
        description={platform('description')}
        resetErrorBoundary={() => undefined}
      />
      <span>{landing('noBrandAccess')}</span>
      <span>{routing('failure.title')}</span>
    </>
  );
}

function CommonProbe() {
  const translate = useTranslations('common.actions');
  return <span>{translate('save')}</span>;
}

function hostTree(children: ReactNode, onError: (error: Error) => void) {
  return (
    <NextIntlClientProvider locale="en" messages={{}} onError={onError}>
      <AppIntlProvider locale="en">
        <AppPageIntlProvider pages={protectedMessages}>
          {children}
        </AppPageIntlProvider>
      </AppIntlProvider>
    </NextIntlClientProvider>
  );
}

describe('host global modal catalog boundary', () => {
  afterEach(cleanup);

  it('keeps rendered shell failures, brandless empty states and shared metrics translated', () => {
    const onError = vi.fn();
    render(
      hostTree(
        <>
          <UnavailableShellProbe />
          <OrganizationAutomationBrandEmptyState orgSlug="acme" />
          <AnalyticsMetricInfo metric="views" />
        </>,
        onError,
      ),
    );
    expect(
      screen.getByText(pages.platformFlags.unavailable.title),
    ).toBeTruthy();
    expect(
      screen.getByText(pages.organizationLanding.noBrandAccess),
    ).toBeTruthy();
    expect(
      screen.getByText(pages.organizationRouting.failure.title),
    ).toBeTruthy();
    expect(screen.getByText(common.automation.brandEmpty.title)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'About Views' })).toBeTruthy();
    expect(onError).not.toHaveBeenCalled();
  });

  it.each(CASES)(
    'resolves real translated children from $pathname',
    async ({ pathname, id, value }) => {
      navigation.pathname = pathname;
      const onError = vi.fn();
      const onMessages = vi.fn();
      render(
        hostTree(
          <AppGlobalModalIntlBoundary kind="confirm">
            <Probe id={id} onMessages={onMessages} />
          </AppGlobalModalIntlBoundary>,
          onError,
        ),
      );

      expect(await screen.findByText(value)).toBeTruthy();
      expect(screen.getByText('Save')).toBeTruthy();
      expect(screen.getByText(pages.help.workspaceOverview.title)).toBeTruthy();
      expect(onMessages.mock.calls.at(-1)?.[0].pages).not.toHaveProperty(
        'adminFlags',
      );
      expect(onError).not.toHaveBeenCalled();
    },
  );

  it.each(['brand', 'ingredient', 'gallery'] as const)(
    'adds the bounded asset catalog to %s opened from another area',
    async (kind) => {
      navigation.pathname = '/acme/brand/workspace/overview';
      const onError = vi.fn();
      const onMessages = vi.fn();
      render(
        hostTree(
          <AppGlobalModalIntlBoundary kind={kind}>
            <Probe id="library.emptyOpenPlayground" onMessages={onMessages} />
          </AppGlobalModalIntlBoundary>,
          onError,
        ),
      );

      expect(
        await screen.findByText(pages.library.emptyOpenPlayground),
      ).toBeTruthy();
      expect(onMessages.mock.calls.at(-1)?.[0].pages).not.toHaveProperty(
        'adminFlags',
      );
      expect(onMessages.mock.calls.at(-1)?.[0].pages).not.toHaveProperty(
        'posts',
      );
      expect(onError).not.toHaveBeenCalled();
    },
  );

  it.each([
    'postBatch',
    'upload',
    'export',
    'credential',
    'prompt',
    'metadata',
    'postMetadata',
    'illustration',
    'postRemix',
    'postRepurpose',
  ] satisfies GlobalModalKind[])(
    'keeps the shared catalog for the %s modal',
    (kind) => {
      const onError = vi.fn();
      render(hostTree(renderAppGlobalModal(kind, <CommonProbe />), onError));
      expect(screen.getByText('Save')).toBeTruthy();
      expect(
        resolveModalCatalogScope(kind, navigation.pathname),
      ).toBeUndefined();
      expect(onError).not.toHaveBeenCalled();
    },
  );

  it('preserves an open confirmation source catalog during route navigation', async () => {
    navigation.pathname = '/acme/brand/library/assets';
    const onError = vi.fn();
    const children = (
      <AppGlobalModalIntlBoundary kind="confirm">
        <Probe id="library.emptyOpenPlayground" />
      </AppGlobalModalIntlBoundary>
    );
    const view = render(hostTree(children, onError));
    await screen.findByText(pages.library.emptyOpenPlayground);

    navigation.pathname = '/acme/brand/publishing/posts';
    view.rerender(hostTree(children, onError));
    expect(screen.getByText(pages.library.emptyOpenPlayground)).toBeTruthy();
    expect(onError).not.toHaveBeenCalled();
  });

  it('preserves modal keys so the next confirmation selects its own route catalog', async () => {
    navigation.pathname = '/acme/brand/library/assets';
    const onError = vi.fn();
    const view = render(
      hostTree(
        renderAppGlobalModal(
          'confirm',
          <Probe key="first" id="library.emptyOpenPlayground" />,
        ),
        onError,
      ),
    );
    await screen.findByText(pages.library.emptyOpenPlayground);

    navigation.pathname = '/acme/brand/publishing/posts';
    view.rerender(
      hostTree(
        renderAppGlobalModal(
          'confirm',
          <Probe key="second" id="posts.list.loadError" />,
        ),
        onError,
      ),
    );
    expect(await screen.findByText(pages.posts.list.loadError)).toBeTruthy();
    expect(screen.queryByText(pages.library.emptyOpenPlayground)).toBeNull();
    expect(onError).not.toHaveBeenCalled();
  });

  it('does not mount pending catalog children after a modal closes', async () => {
    navigation.pathname = '/acme/brand/analytics/overview';
    const onError = vi.fn();
    const view = render(
      hostTree(
        <AppGlobalModalIntlBoundary kind="confirm">
          <Probe id="analytics.trendTurnover.heading" />
        </AppGlobalModalIntlBoundary>,
        onError,
      ),
    );
    view.unmount();
    await Promise.resolve();
    expect(
      screen.queryByText(pages.analytics.trendTurnover.heading),
    ).toBeNull();
    expect(onError).not.toHaveBeenCalled();
  });
});
