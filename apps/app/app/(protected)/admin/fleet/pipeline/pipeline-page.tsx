'use client';

import ButtonRefresh from '@components/buttons/refresh/button-refresh/ButtonRefresh';
import KpiCard from '@components/cards/KpiCard';
import type { IPipelineCampaign, IPipelineStats } from '@genfeedai/interfaces';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import type { TableColumn } from '@props/ui/display/table.props';
import { AdminFleetService } from '@services/admin/fleet.service';
import { logger } from '@services/core/logger.service';
import { useQuery } from '@tanstack/react-query';
import CardEmpty from '@ui/card/empty/CardEmpty';
import Badge from '@ui/display/badge/Badge';
import { SkeletonCard } from '@ui/display/skeleton/skeleton';
import AppTable from '@ui/display/table/Table';
import Container from '@ui/layout/container/Container';
import { useEffect } from 'react';
import {
  HiOutlineChartBar,
  HiOutlineClock,
  HiOutlineCpuChip,
  HiOutlineDocumentCheck,
  HiOutlinePhoto,
} from 'react-icons/hi2';

const CAMPAIGN_STATUS_COLORS = {
  active: 'bg-success/10 text-success',
  completed: 'bg-foreground/5 text-foreground/60',
  draft: 'bg-warning/10 text-warning',
  paused: 'bg-info/10 text-info',
} as const;

export default function PipelinePage() {
  const getFleetService = useAuthedService((token: string) =>
    AdminFleetService.getInstance(token),
  );

  const {
    data: stats,
    isLoading: isLoadingStats,
    error: statsError,
  } = useQuery<IPipelineStats>({
    queryKey: ['fleet-pipeline-stats'],
    queryFn: async () => {
      const service = await getFleetService();
      return service.getPipelineStats();
    },
  });

  const {
    data: campaigns,
    isLoading: isLoadingCampaigns,
    isFetching: isFetchingCampaigns,
    error: campaignsError,
    refetch: refresh,
  } = useQuery<IPipelineCampaign[]>({
    queryKey: ['fleet-pipeline-campaigns'],
    queryFn: async () => {
      const service = await getFleetService();
      return service.getCampaigns();
    },
  });

  const isRefreshing = isFetchingCampaigns && !isLoadingCampaigns;

  useEffect(() => {
    if (statsError) {
      logger.error('GET /admin/fleet/pipeline/stats failed', statsError);
    }
  }, [statsError]);

  useEffect(() => {
    if (campaignsError) {
      logger.error(
        'GET /admin/fleet/pipeline/campaigns failed',
        campaignsError,
      );
    }
  }, [campaignsError]);

  const columns: TableColumn<IPipelineCampaign>[] = [
    { header: 'Campaign Name', key: 'name' },
    {
      header: 'Status',
      key: 'status',
      render: (c: IPipelineCampaign) => (
        <Badge
          className={
            CAMPAIGN_STATUS_COLORS[
              c.status as keyof typeof CAMPAIGN_STATUS_COLORS
            ] ?? 'bg-foreground/5 text-foreground/60'
          }
        >
          {c.status}
        </Badge>
      ),
    },
    {
      header: 'Assets Count',
      key: 'assetsCount',
    },
    {
      header: 'Created',
      key: 'createdAt',
      render: (c: IPipelineCampaign) =>
        new Date(c.createdAt).toLocaleDateString(),
    },
  ];

  return (
    <Container
      label="Pipeline"
      description="Content generation pipeline and campaign management"
      icon={HiOutlineChartBar}
      right={
        <ButtonRefresh onClick={() => refresh()} isRefreshing={isRefreshing} />
      }
    >
      {/* KPI Cards */}
      {isLoadingStats ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
          {Array.from({ length: 4 }, (_, index) => `stat-${index + 1}`).map(
            (key) => (
              <SkeletonCard key={key} showImage={false} />
            ),
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
          <KpiCard
            description="Total generated"
            icon={HiOutlinePhoto}
            title="Assets Generated"
            value={stats?.assetsGenerated ?? 0}
          />

          <KpiCard
            colorClass="text-warning"
            description="Awaiting review"
            icon={HiOutlineClock}
            title="Pending Review"
            value={stats?.assetsPendingReview ?? 0}
          />

          <KpiCard
            colorClass="text-success"
            description="Ready for use"
            icon={HiOutlineDocumentCheck}
            title="Published"
            value={stats?.assetsPublished ?? 0}
          />

          <KpiCard
            colorClass="text-info"
            description="Currently running"
            icon={HiOutlineCpuChip}
            title="Active Trainings"
            value={stats?.trainingsActive ?? 0}
          />
        </div>
      )}

      {/* Campaigns Table */}
      <h3 className="text-sm font-semibold mb-4">Campaigns</h3>

      {!isLoadingCampaigns && (!campaigns || campaigns.length === 0) ? (
        <CardEmpty label="No campaigns found" />
      ) : (
        <AppTable<IPipelineCampaign>
          columns={columns}
          emptyLabel="No campaigns found"
          getRowKey={(c) => c.id}
          isLoading={isLoadingCampaigns}
          items={campaigns || []}
        />
      )}
    </Container>
  );
}
