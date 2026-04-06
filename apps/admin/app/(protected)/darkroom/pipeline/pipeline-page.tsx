'use client';

import ButtonRefresh from '@components/buttons/refresh/button-refresh/ButtonRefresh';
import KpiCard from '@components/cards/KpiCard';
import type { IPipelineCampaign, IPipelineStats } from '@genfeedai/interfaces';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useResource } from '@hooks/data/resource/use-resource/use-resource';
import type { TableColumn } from '@props/ui/display/table.props';
import { AdminDarkroomService } from '@services/admin/darkroom.service';
import { logger } from '@services/core/logger.service';
import CardEmpty from '@ui/card/empty/CardEmpty';
import Badge from '@ui/display/badge/Badge';
import { SkeletonCard } from '@ui/display/skeleton/skeleton';
import AppTable from '@ui/display/table/Table';
import Container from '@ui/layout/container/Container';
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
  const getDarkroomService = useAuthedService((token: string) =>
    AdminDarkroomService.getInstance(token),
  );

  const { data: stats, isLoading: isLoadingStats } =
    useResource<IPipelineStats>(
      async () => {
        const service = await getDarkroomService();
        return service.getPipelineStats();
      },
      {
        onError: (error: unknown) => {
          logger.error('GET /admin/darkroom/pipeline/stats failed', error);
        },
      },
    );

  const {
    data: campaigns,
    isLoading: isLoadingCampaigns,
    isRefreshing,
    refresh,
  } = useResource<IPipelineCampaign[]>(
    async () => {
      const service = await getDarkroomService();
      return service.getCampaigns();
    },
    {
      onError: (error: unknown) => {
        logger.error('GET /admin/darkroom/pipeline/campaigns failed', error);
      },
    },
  );

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
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonCard key={i} showImage={false} />
          ))}
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
      <h3 className="text-lg font-semibold mb-4">Campaigns</h3>

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
