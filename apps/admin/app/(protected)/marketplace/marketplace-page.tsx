'use client';

import Button from '@components/buttons/base/Button';
import ButtonRefresh from '@components/buttons/refresh/button-refresh/ButtonRefresh';
import {
  AlertCategory,
  ButtonVariant,
  ListingStatus,
  ListingType,
  SellerStatus,
} from '@genfeedai/enums';
import type { IListing, IPurchase, ISeller } from '@genfeedai/interfaces';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useResource } from '@hooks/data/resource/use-resource/use-resource';
import type { BadgeProps } from '@props/ui/display/badge.props';
import type { TableColumn } from '@props/ui/display/table.props';
import {
  AdminMarketplaceService,
  type MarketplaceAnalyticsOverview,
} from '@services/admin/marketplace.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import Badge from '@ui/display/badge/Badge';
import KeyMetric from '@ui/display/key-metric/KeyMetric';
import AppTable from '@ui/display/table/Table';
import Alert from '@ui/feedback/alert/Alert';
import Container from '@ui/layout/container/Container';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@ui/primitives/dialog';
import { Input } from '@ui/primitives/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import { Textarea } from '@ui/primitives/textarea';
import { useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';

type TabKey =
  | 'listings'
  | 'moderation'
  | 'sellers'
  | 'sales'
  | 'payouts'
  | 'analytics';

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: 'listings', label: 'Listings' },
  { key: 'moderation', label: 'Moderation' },
  { key: 'sellers', label: 'Sellers' },
  { key: 'sales', label: 'Sales' },
  { key: 'payouts', label: 'Payouts' },
  { key: 'analytics', label: 'Analytics' },
];
const ALL_LISTING_STATUSES_VALUE = '__all-listing-statuses__';
const ALL_LISTING_TYPES_VALUE = '__all-listing-types__';
const ALL_SELLER_STATUSES_VALUE = '__all-seller-statuses__';

const STATUS_VARIANTS: Record<string, string> = {
  approved: 'success',
  archived: 'ghost',
  completed: 'validated',
  failed: 'error',
  pending: 'warning',
  pending_review: 'warning',
  processing: 'info',
  published: 'success',
  refunded: 'amber',
  rejected: 'error',
  suspended: 'error',
};

function getVariant(value?: string): BadgeProps['variant'] {
  if (!value) {
    return 'ghost';
  }
  return (STATUS_VARIANTS[value] as BadgeProps['variant']) || 'ghost';
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    currency: 'USD',
    style: 'currency',
  }).format(amount / 100);
}

export default function MarketplacePage() {
  const searchParams = useSearchParams();
  const notificationsService = NotificationsService.getInstance();
  const requestedTab = searchParams.get('tab');
  const initialTab: TabKey =
    requestedTab && TABS.some((tab) => tab.key === requestedTab)
      ? (requestedTab as TabKey)
      : 'moderation';
  const [activeTab, setActiveTab] = useState<TabKey>(initialTab);
  const [search, setSearch] = useState('');
  const [listingStatus, setListingStatus] = useState('');
  const [listingType, setListingType] = useState('');
  const [sellerStatus, setSellerStatus] = useState('');
  const [rejectTarget, setRejectTarget] = useState<IListing | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);

  const getMarketplaceService = useAuthedService((token: string) =>
    AdminMarketplaceService.getInstance(token),
  );

  const listingsResource = useResource(
    async () => {
      const service = await getMarketplaceService();
      return service.getListings({
        limit: 50,
        page: 1,
        search: search || undefined,
        sort: 'createdAt: -1',
        status: listingStatus ? (listingStatus as ListingStatus) : undefined,
        type: listingType ? (listingType as ListingType) : undefined,
      });
    },
    {
      defaultValue: { listings: [] as IListing[] },
      dependencies: [search, listingStatus, listingType],
      enabled: activeTab === 'listings',
      onError: (error: Error) => {
        logger.error('GET /admin/marketplace/listings failed', error);
      },
    },
  );

  const moderationResource = useResource(
    async () => {
      const service = await getMarketplaceService();
      return service.getListings({
        limit: 50,
        page: 1,
        search: search || undefined,
        sort: 'createdAt: -1',
        status: ListingStatus.PENDING_REVIEW,
      });
    },
    {
      defaultValue: { listings: [] as IListing[] },
      dependencies: [search],
      enabled: activeTab === 'moderation',
      onError: (error: Error) => {
        logger.error(
          'GET /admin/marketplace/listings?status=pending_review failed',
          error,
        );
      },
    },
  );

  const sellersResource = useResource(
    async () => {
      const service = await getMarketplaceService();
      return service.getSellers({
        limit: 50,
        page: 1,
        search: search || undefined,
        sort: 'totalSales: -1',
        status: sellerStatus ? (sellerStatus as SellerStatus) : undefined,
      });
    },
    {
      defaultValue: { sellers: [] as ISeller[] },
      dependencies: [search, sellerStatus],
      enabled: activeTab === 'sellers',
      onError: (error: Error) => {
        logger.error('GET /admin/marketplace/sellers failed', error);
      },
    },
  );

  const salesResource = useResource(
    async () => {
      const service = await getMarketplaceService();
      return service.getPurchases({
        limit: 50,
        page: 1,
        search: search || undefined,
        sort: 'createdAt: -1',
      });
    },
    {
      defaultValue: { purchases: [] as IPurchase[] },
      dependencies: [search],
      enabled: activeTab === 'sales',
      onError: (error: Error) => {
        logger.error('GET /admin/marketplace/purchases failed', error);
      },
    },
  );

  const payoutsResource = useResource(
    async () => {
      const service = await getMarketplaceService();
      return service.getPayouts({
        limit: 50,
        page: 1,
        search: search || undefined,
        sort: 'totalEarnings: -1',
      });
    },
    {
      defaultValue: { payouts: [] as ISeller[] },
      dependencies: [search],
      enabled: activeTab === 'payouts',
      onError: (error: Error) => {
        logger.error('GET /admin/marketplace/payouts failed', error);
      },
    },
  );

  const analyticsResource = useResource(
    async () => {
      const service = await getMarketplaceService();
      return service.getAnalyticsOverview(30);
    },
    {
      defaultValue: {
        completedOrders: 0,
        failedOrders: 0,
        pendingOrders: 0,
        recentSales: [],
        totalPlatformFees: 0,
        totalRevenue: 0,
        totalSales: 0,
        totalSellerEarnings: 0,
      } as MarketplaceAnalyticsOverview,
      enabled: activeTab === 'analytics',
      onError: (error: Error) => {
        logger.error('GET /admin/marketplace/analytics/overview failed', error);
      },
    },
  );

  const handleRefresh = async () => {
    if (activeTab === 'listings') {
      await listingsResource.refresh();
      return;
    }
    if (activeTab === 'moderation') {
      await moderationResource.refresh();
      return;
    }
    if (activeTab === 'sellers') {
      await sellersResource.refresh();
      return;
    }
    if (activeTab === 'sales') {
      await salesResource.refresh();
      return;
    }
    if (activeTab === 'payouts') {
      await payoutsResource.refresh();
      return;
    }
    await analyticsResource.refresh();
  };

  useEffect(() => {
    if (requestedTab && TABS.some((tab) => tab.key === requestedTab)) {
      setActiveTab(requestedTab as TabKey);
    }
  }, [requestedTab]);

  const handleApprove = useCallback(
    async (listing: IListing) => {
      setIsSubmittingReview(true);
      try {
        const service = await getMarketplaceService();
        await service.approveListing(listing.id);
        notificationsService.success(`Approved ${listing.title}`);
        await moderationResource.refresh();
      } catch (error) {
        logger.error(
          'POST /admin/marketplace/listings/:listingId/approve failed',
          error,
        );
        notificationsService.error('Failed to approve listing');
      } finally {
        setIsSubmittingReview(false);
      }
    },
    [getMarketplaceService, moderationResource, notificationsService],
  );

  const handleConfirmReject = useCallback(async () => {
    if (!rejectTarget) {
      return;
    }
    if (!rejectReason.trim()) {
      notificationsService.error('Please provide a rejection reason');
      return;
    }

    setIsSubmittingReview(true);
    try {
      const service = await getMarketplaceService();
      await service.rejectListing(rejectTarget.id, rejectReason.trim());
      notificationsService.success(`Rejected ${rejectTarget.title}`);
      setRejectTarget(null);
      setRejectReason('');
      await moderationResource.refresh();
    } catch (error) {
      logger.error(
        'POST /admin/marketplace/listings/:listingId/reject failed',
        error,
      );
      notificationsService.error('Failed to reject listing');
    } finally {
      setIsSubmittingReview(false);
    }
  }, [
    getMarketplaceService,
    moderationResource,
    notificationsService,
    rejectReason,
    rejectTarget,
  ]);

  const handleSellerStatusToggle = useCallback(
    async (seller: ISeller) => {
      const nextStatus =
        seller.status === SellerStatus.SUSPENDED
          ? SellerStatus.APPROVED
          : SellerStatus.SUSPENDED;

      try {
        const service = await getMarketplaceService();
        await service.updateSellerStatus(seller.id, nextStatus);
        notificationsService.success(
          `${seller.displayName} set to ${nextStatus.replace('_', ' ')}`,
        );
        await sellersResource.refresh();
      } catch (error) {
        logger.error(
          'PATCH /admin/marketplace/sellers/:sellerId/status failed',
          error,
        );
        notificationsService.error('Failed to update seller status');
      }
    },
    [getMarketplaceService, notificationsService, sellersResource],
  );

  const listingColumns: TableColumn<IListing>[] = useMemo(
    () => [
      { header: 'Title', key: 'title' },
      { header: 'Type', key: 'type' },
      {
        header: 'Status',
        key: 'status',
        render: (listing) => (
          <Badge variant={getVariant(listing.status)}>{listing.status}</Badge>
        ),
      },
      {
        header: 'Price',
        key: 'price',
        render: (listing) => formatCurrency(listing.price),
      },
      {
        header: 'Downloads',
        key: 'downloads',
      },
      {
        header: 'Purchases',
        key: 'purchases',
      },
    ],
    [],
  );

  const moderationColumns: TableColumn<IListing>[] = useMemo(
    () => [
      { header: 'Title', key: 'title' },
      { header: 'Type', key: 'type' },
      {
        header: 'Actions',
        key: 'actions',
        render: (listing) => (
          <div className="flex items-center gap-2">
            <Button
              onClick={() => handleApprove(listing)}
              variant={ButtonVariant.DEFAULT}
              isDisabled={isSubmittingReview}
              label="Approve"
            />
            <Button
              onClick={() => setRejectTarget(listing)}
              variant={ButtonVariant.DESTRUCTIVE}
              isDisabled={isSubmittingReview}
              label="Reject"
            />
          </div>
        ),
      },
    ],
    [handleApprove, isSubmittingReview],
  );

  const sellersColumns: TableColumn<ISeller>[] = useMemo(
    () => [
      { header: 'Seller', key: 'displayName' },
      { header: 'Slug', key: 'slug' },
      {
        header: 'Status',
        key: 'status',
        render: (seller) => (
          <Badge variant={getVariant(seller.status)}>{seller.status}</Badge>
        ),
      },
      {
        header: 'Sales',
        key: 'totalSales',
      },
      {
        header: 'Earnings',
        key: 'totalEarnings',
        render: (seller) => formatCurrency(seller.totalEarnings),
      },
      {
        header: 'Action',
        key: 'actions',
        render: (seller) => (
          <Button
            onClick={() => handleSellerStatusToggle(seller)}
            variant={ButtonVariant.SECONDARY}
            label={
              seller.status === SellerStatus.SUSPENDED ? 'Approve' : 'Suspend'
            }
          />
        ),
      },
    ],
    [handleSellerStatusToggle],
  );

  const salesColumns: TableColumn<IPurchase>[] = useMemo(
    () => [
      {
        header: 'Listing',
        key: 'listingSnapshot',
        render: (purchase) => purchase.listingSnapshot?.title || '-',
      },
      { header: 'Currency', key: 'currency' },
      {
        header: 'Total',
        key: 'total',
        render: (purchase) => formatCurrency(purchase.total),
      },
      {
        header: 'Status',
        key: 'status',
        render: (purchase) => (
          <Badge variant={getVariant(purchase.status)}>{purchase.status}</Badge>
        ),
      },
      {
        header: 'Downloads',
        key: 'downloadCount',
      },
      {
        header: 'Created',
        key: 'createdAt',
        render: (purchase) =>
          purchase.createdAt
            ? new Date(purchase.createdAt).toLocaleDateString()
            : '-',
      },
    ],
    [],
  );

  const payoutsColumns: TableColumn<ISeller>[] = useMemo(
    () => [
      { header: 'Seller', key: 'displayName' },
      {
        header: 'Stripe',
        key: 'stripeOnboardingComplete',
        render: (seller) => (
          <Badge
            variant={seller.stripeOnboardingComplete ? 'success' : 'warning'}
          >
            {seller.stripeOnboardingComplete ? 'Ready' : 'Incomplete'}
          </Badge>
        ),
      },
      {
        header: 'Payouts',
        key: 'payoutEnabled',
        render: (seller) => (
          <Badge variant={seller.payoutEnabled ? 'success' : 'warning'}>
            {seller.payoutEnabled ? 'Enabled' : 'Disabled'}
          </Badge>
        ),
      },
      {
        header: 'Sales',
        key: 'totalSales',
      },
      {
        header: 'Total Earnings',
        key: 'totalEarnings',
        render: (seller) => formatCurrency(seller.totalEarnings),
      },
    ],
    [],
  );

  const isRefreshing =
    listingsResource.isRefreshing ||
    moderationResource.isRefreshing ||
    sellersResource.isRefreshing ||
    salesResource.isRefreshing ||
    payoutsResource.isRefreshing ||
    analyticsResource.isRefreshing;

  const activeError =
    activeTab === 'listings'
      ? listingsResource.error
      : activeTab === 'moderation'
        ? moderationResource.error
        : activeTab === 'sellers'
          ? sellersResource.error
          : activeTab === 'sales'
            ? salesResource.error
            : activeTab === 'payouts'
              ? payoutsResource.error
              : analyticsResource.error;

  return (
    <Container
      label="Marketplace"
      description="Admin marketplace management and moderation."
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          {TABS.map((tab) => (
            <Button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              variant={
                activeTab === tab.key
                  ? ButtonVariant.SECONDARY
                  : ButtonVariant.GHOST
              }
              label={tab.label}
            />
          ))}
          <div className="ml-auto">
            <ButtonRefresh
              onClick={handleRefresh}
              isRefreshing={isRefreshing}
            />
          </div>
        </div>

        {activeTab !== 'analytics' && (
          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search"
              className="min-w-[240px] rounded border border-white/10 bg-white/5 px-3 py-2 text-sm"
            />

            {activeTab === 'listings' && (
              <>
                <Select
                  value={listingStatus || ALL_LISTING_STATUSES_VALUE}
                  onValueChange={(value) =>
                    setListingStatus(
                      value === ALL_LISTING_STATUSES_VALUE ? '' : value,
                    )
                  }
                >
                  <SelectTrigger className="w-44 bg-white/5">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL_LISTING_STATUSES_VALUE}>
                      All statuses
                    </SelectItem>
                    {Object.values(ListingStatus).map((status) => (
                      <SelectItem key={status} value={status}>
                        {status}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={listingType || ALL_LISTING_TYPES_VALUE}
                  onValueChange={(value) =>
                    setListingType(
                      value === ALL_LISTING_TYPES_VALUE ? '' : value,
                    )
                  }
                >
                  <SelectTrigger className="w-44 bg-white/5">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL_LISTING_TYPES_VALUE}>
                      All types
                    </SelectItem>
                    {Object.values(ListingType).map((type) => (
                      <SelectItem key={type} value={type}>
                        {type}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </>
            )}

            {activeTab === 'sellers' && (
              <Select
                value={sellerStatus || ALL_SELLER_STATUSES_VALUE}
                onValueChange={(value) =>
                  setSellerStatus(
                    value === ALL_SELLER_STATUSES_VALUE ? '' : value,
                  )
                }
              >
                <SelectTrigger className="w-44 bg-white/5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_SELLER_STATUSES_VALUE}>
                    All statuses
                  </SelectItem>
                  {Object.values(SellerStatus).map((status) => (
                    <SelectItem key={status} value={status}>
                      {status}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        )}

        {activeError && (
          <Alert type={AlertCategory.ERROR}>
            Failed to load marketplace data. Please refresh and retry.
          </Alert>
        )}

        {activeTab === 'listings' && (
          <AppTable<IListing>
            items={listingsResource.data.listings}
            columns={listingColumns}
            isLoading={listingsResource.isLoading}
            emptyLabel="No listings found"
          />
        )}

        {activeTab === 'moderation' && (
          <AppTable<IListing>
            items={moderationResource.data.listings}
            columns={moderationColumns}
            isLoading={moderationResource.isLoading}
            emptyLabel="No listings pending review"
          />
        )}

        {activeTab === 'sellers' && (
          <AppTable<ISeller>
            items={sellersResource.data.sellers}
            columns={sellersColumns}
            isLoading={sellersResource.isLoading}
            emptyLabel="No sellers found"
          />
        )}

        {activeTab === 'sales' && (
          <AppTable<IPurchase>
            items={salesResource.data.purchases}
            columns={salesColumns}
            isLoading={salesResource.isLoading}
            emptyLabel="No sales found"
          />
        )}

        {activeTab === 'payouts' && (
          <AppTable<ISeller>
            items={payoutsResource.data.payouts}
            columns={payoutsColumns}
            isLoading={payoutsResource.isLoading}
            emptyLabel="No payout records found"
          />
        )}

        {activeTab === 'analytics' && (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
            <KeyMetric
              label="Revenue"
              value={formatCurrency(analyticsResource.data.totalRevenue)}
              valueClassName="text-xl"
            />
            <KeyMetric
              label="Sales"
              value={analyticsResource.data.totalSales}
              valueClassName="text-xl"
            />
            <KeyMetric
              label="Platform Fees"
              value={formatCurrency(analyticsResource.data.totalPlatformFees)}
              valueClassName="text-xl"
            />
            <KeyMetric
              label="Seller Earnings"
              value={formatCurrency(analyticsResource.data.totalSellerEarnings)}
              valueClassName="text-xl"
            />
            <KeyMetric
              label="Completed"
              value={analyticsResource.data.completedOrders}
              valueClassName="text-xl"
            />
            <KeyMetric
              label="Pending"
              value={analyticsResource.data.pendingOrders}
              valueClassName="text-xl"
            />
            <KeyMetric
              label="Failed"
              value={analyticsResource.data.failedOrders}
              valueClassName="text-xl"
            />
          </div>
        )}
      </div>

      <Dialog
        open={Boolean(rejectTarget)}
        onOpenChange={() => setRejectTarget(null)}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Reject Listing</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <p className="text-sm text-foreground/70">
              Add a reason for rejecting <strong>{rejectTarget?.title}</strong>.
            </p>
            <Textarea
              className="min-h-[120px] w-full rounded border border-white/10 bg-white/5 px-3 py-2 text-sm"
              value={rejectReason}
              onChange={(event) => setRejectReason(event.target.value)}
              placeholder="Reason for rejection"
            />
          </div>
          <DialogFooter>
            <Button
              onClick={() => setRejectTarget(null)}
              variant={ButtonVariant.SECONDARY}
              label="Cancel"
            />
            <Button
              onClick={handleConfirmReject}
              variant={ButtonVariant.DESTRUCTIVE}
              isLoading={isSubmittingReview}
              label="Reject Listing"
            />
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Container>
  );
}
