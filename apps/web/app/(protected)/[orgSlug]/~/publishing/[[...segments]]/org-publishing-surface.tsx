import { PageScope } from '@genfeedai/contracts';
import {
  APP_ROUTES,
  createOrganizationAppRoute,
} from '@genfeedai/contracts/constants';
import { notFound, redirect } from 'next/navigation';
import { type ComponentType, Suspense } from 'react';
import {
  CampaignDetailAds,
  CampaignDetailOverview,
  CampaignDetailPerformance,
  CampaignDetailShell,
  CampaignFormPage,
  CampaignsListPage,
} from '@/features/campaigns';
import NewsletterSettingsPage from '@/features/newsletter/settings/NewsletterSettingsPage';
import NewsletterSubscribersPage from '@/features/newsletter/subscribers/NewsletterSubscribersPage';
import type { OrgRootAppEntryPageProps } from '@/props/layout/org-root-app-page.props';
import type { PostsListSearchParams } from '@/props/publishing/publishing-list-page.props';
import ContentCalendarPage from '../../../[brandSlug]/publishing/calendar/content-calendar-page';
import PublishingCampaignComparePage from '../../../[brandSlug]/publishing/campaigns/compare/page';
import PublishingOverviewRoute from '../../../[brandSlug]/publishing/overview/page';
import PublishingContentEditorPage from '../../../[brandSlug]/publishing/posts/[id]/PublishingContentEditorPage';
import PublishingLayoutContent from '../../../[brandSlug]/publishing/publishing-layout-content';
import { renderPostsListPage } from '../../../[brandSlug]/publishing/publishing-list-page';
import ReviewQueueContent from '../../../[brandSlug]/publishing/review/review-queue-content';

const NEWSLETTER_PAGES: Readonly<Record<string, ComponentType>> = {
  '': NewsletterSubscribersPage,
  settings: NewsletterSettingsPage,
};

async function renderOrgCampaignSurface({
  campaignId,
  campaignSection,
  searchParams,
}: {
  campaignId?: string;
  campaignSection?: string;
  searchParams: PostsListSearchParams;
}) {
  if (!campaignId) {
    return (
      <Suspense fallback={null}>
        <CampaignsListPage />
      </Suspense>
    );
  }

  if (campaignId === 'new') {
    return (
      <Suspense fallback={null}>
        <CampaignsListPage isCreateOpen />
      </Suspense>
    );
  }

  if (campaignId === 'compare') {
    if (campaignSection) {
      notFound();
    }

    return <PublishingCampaignComparePage />;
  }

  if (!campaignSection) {
    return (
      <Suspense fallback={null}>
        <CampaignDetailShell campaignId={campaignId} section="overview">
          <CampaignDetailOverview campaignId={campaignId} />
        </CampaignDetailShell>
      </Suspense>
    );
  }

  if (campaignSection === 'edit') {
    return (
      <Suspense fallback={null}>
        <CampaignFormPage campaignId={campaignId} />
      </Suspense>
    );
  }

  if (campaignSection === 'content') {
    const postsListPage = await renderPostsListPage({
      campaignId,
      searchParams,
      scope: PageScope.ORGANIZATION,
    });

    return (
      <Suspense fallback={null}>
        <CampaignDetailShell campaignId={campaignId} section="content">
          {postsListPage}
        </CampaignDetailShell>
      </Suspense>
    );
  }

  if (campaignSection === 'calendar') {
    return (
      <Suspense fallback={null}>
        <CampaignDetailShell campaignId={campaignId} section="calendar">
          <ContentCalendarPage campaignId={campaignId} />
        </CampaignDetailShell>
      </Suspense>
    );
  }

  if (campaignSection === 'performance') {
    return (
      <Suspense fallback={null}>
        <CampaignDetailShell campaignId={campaignId} section="performance">
          <CampaignDetailPerformance campaignId={campaignId} />
        </CampaignDetailShell>
      </Suspense>
    );
  }

  if (campaignSection === 'ads') {
    return (
      <Suspense fallback={null}>
        <CampaignDetailShell campaignId={campaignId} section="ads">
          <CampaignDetailAds campaignId={campaignId} />
        </CampaignDetailShell>
      </Suspense>
    );
  }

  notFound();
}

/**
 * The organization Publishing app behind `/:org/~/publishing/*`. Its own module
 * keeps the Publishing features out of every other organization app's client
 * manifest.
 */
export default async function OrgPublishingSurface({
  params,
  searchParams,
}: OrgRootAppEntryPageProps) {
  const { orgSlug, segments } = await params;

  const publishingSegments = segments ?? [];
  const [section, campaignId, campaignSection] = publishingSegments;

  if (!section) {
    redirect(
      createOrganizationAppRoute(orgSlug, APP_ROUTES.PUBLISHING.OVERVIEW),
    );
  }

  if (publishingSegments.length === 1 && section === 'overview') {
    return (
      <PublishingLayoutContent>
        <PublishingOverviewRoute />
      </PublishingLayoutContent>
    );
  }

  if (publishingSegments.length === 1 && section === 'posts') {
    const postsListPage = await renderPostsListPage({
      searchParams: searchParams ?? Promise.resolve({}),
      scope: PageScope.ORGANIZATION,
    });

    return <PublishingLayoutContent>{postsListPage}</PublishingLayoutContent>;
  }

  if (publishingSegments.length === 1 && section === 'calendar') {
    return (
      <PublishingLayoutContent>
        <ContentCalendarPage embedded />
      </PublishingLayoutContent>
    );
  }

  if (section === 'approvals' && publishingSegments.length <= 3) {
    return (
      <PublishingLayoutContent>
        <ReviewQueueContent />
      </PublishingLayoutContent>
    );
  }

  if (publishingSegments.length === 2 && section === 'posts' && campaignId) {
    const detailPage = (
      <Suspense fallback={null}>
        <PublishingContentEditorPage contentId={campaignId} />
      </Suspense>
    );

    return <PublishingLayoutContent>{detailPage}</PublishingLayoutContent>;
  }

  // Newsletter pages belong to one brand; the all-brands view asks for one.
  if (section === 'newsletter' && publishingSegments.length <= 2) {
    const NewsletterPage = Object.hasOwn(NEWSLETTER_PAGES, campaignId ?? '')
      ? NEWSLETTER_PAGES[campaignId ?? '']
      : undefined;
    if (!NewsletterPage) {
      notFound();
    }
    return (
      <PublishingLayoutContent>
        <Suspense fallback={null}>
          <NewsletterPage />
        </Suspense>
      </PublishingLayoutContent>
    );
  }

  if (section === 'campaigns') {
    const hasSurplusSegments =
      publishingSegments.length > 3 ||
      (campaignId === 'new' && publishingSegments.length > 2);

    if (hasSurplusSegments) {
      notFound();
    }

    return (
      <PublishingLayoutContent>
        {
          await renderOrgCampaignSurface({
            campaignId,
            campaignSection,
            searchParams: searchParams ?? Promise.resolve({}),
          })
        }
      </PublishingLayoutContent>
    );
  }

  notFound();
}
