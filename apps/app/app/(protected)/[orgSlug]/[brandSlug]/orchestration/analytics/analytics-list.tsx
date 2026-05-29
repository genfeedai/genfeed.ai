'use client';

import { useAuth } from '@clerk/nextjs';
import { useBrand } from '@contexts/user/brand-context/brand-context';
import { ButtonVariant, IngredientCategory, Status } from '@genfeedai/enums';
import type { IAnalytics, ITimeSeriesDataPoint } from '@genfeedai/interfaces';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import type { Video } from '@models/ingredients/video.model';
import type { ContentProps } from '@props/layout/content.props';
import { useExportModal } from '@providers/global-modals/global-modals.provider';
import { AnalyticsService } from '@services/analytics/analytics.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { VideosService } from '@services/ingredients/videos.service';
import { OrganizationsService } from '@services/organization/organizations.service';
import { BrandsService } from '@services/social/brands.service';
import Container from '@ui/layout/container/Container';
import { Button } from '@ui/primitives/button';
import { useCallback, useEffect, useState } from 'react';
import { HiArrowDownTray, HiOutlineChartBar } from 'react-icons/hi2';
import AnalyticsKPISection from './analytics-kpi-section';
import AnalyticsRecentVideos from './analytics-recent-videos';
import AnalyticsViewsChart from './analytics-views-chart';

export default function AnalyticsList(_props: ContentProps) {
  const { isSignedIn } = useAuth();
  const { brandId, organizationId } = useBrand();
  const { openExport } = useExportModal();

  const notificationsService = NotificationsService.getInstance();

  const getBrandsService = useAuthedService((token: string) =>
    BrandsService.getInstance(token),
  );

  const getAnalyticsService = useAuthedService((token: string) =>
    AnalyticsService.getInstance(token),
  );

  const getVideosService = useAuthedService((token: string) =>
    VideosService.getInstance(token),
  );

  const getOrganizationsService = useAuthedService((token: string) =>
    OrganizationsService.getInstance(token),
  );

  const [isLoading, setIsLoading] = useState(true);
  const [isTimeSeriesLoading, setIsTimeSeriesLoading] = useState(true);

  const [recentVideos, setRecentVideos] = useState<Video[]>([]);
  const [timeSeriesData, setTimeSeriesData] = useState<ITimeSeriesDataPoint[]>(
    [],
  );

  const [stats, setStats] = useState<IAnalytics>({
    monthlyGrowth: 0,
    totalCredentialsConnected: 0,
    totalPosts: 0,
    totalViews: 0,
    viewsGrowth: 0,
  });

  const findAnalytics = useCallback(async () => {
    setIsLoading(true);

    const url = 'GET /analytics';

    try {
      let data: IAnalytics = {
        monthlyGrowth: 0,
        totalCredentialsConnected: 0,
        totalPosts: 0,
        totalViews: 0,
        viewsGrowth: 0,
      };

      logger.info(`${url} success`, { brandId, organizationId });

      if (brandId) {
        const service = await getBrandsService();
        data = await service.findBrandAnalytics(brandId);
      } else if (organizationId) {
        const service = await getOrganizationsService();
        data = await service.findOrganizationAnalytics(organizationId);
      }

      setStats(data);
      setIsLoading(false);
    } catch (error) {
      logger.error(`${url} failed`, error);
      setIsLoading(false);
    }
  }, [brandId, organizationId, getBrandsService, getOrganizationsService]);

  const findAllVideos = useCallback(async () => {
    const url = 'GET /videos';
    try {
      const service = await getVideosService();
      const query: {
        brand?: string;
        category: IngredientCategory;
        limit: number;
        organization?: string;
        status: Status;
      } = {
        category: IngredientCategory.VIDEO,
        limit: 5, // Load more videos for masonry layout
        status: Status.COMPLETED,
      };

      if (brandId) {
        query.brand = brandId;
      }

      if (organizationId) {
        query.organization = organizationId;
      }

      const data = await service.findAll(query);
      logger.info(`${url} success`, data);

      setRecentVideos(data);
    } catch (error) {
      logger.error(`${url} failed`, error);
    }
  }, [brandId, organizationId, getVideosService]);

  const findTimeSeries = useCallback(async () => {
    setIsTimeSeriesLoading(true);

    const url = 'GET /analytics/timeseries';

    try {
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(endDate.getDate() - 7);

      const query = {
        endDate: endDate.toISOString(),
        groupBy: 'day' as const,
        startDate: startDate.toISOString(),
      };

      let data: ITimeSeriesDataPoint[] = [];

      if (brandId) {
        const service = await getBrandsService();
        data = (await service.findBrandAnalyticsTimeSeries(
          brandId,
          query,
        )) as ITimeSeriesDataPoint[];
      } else if (organizationId) {
        const service = await getOrganizationsService();
        data = (await service.findOrganizationAnalyticsTimeSeries(
          organizationId,
          query,
        )) as ITimeSeriesDataPoint[];
      }

      logger.info(`${url} success`, data);
      setTimeSeriesData(data);
      setIsTimeSeriesLoading(false);
    } catch (error) {
      logger.error(`${url} failed`, error);
      setIsTimeSeriesLoading(false);
    }
  }, [brandId, organizationId, getBrandsService, getOrganizationsService]);

  useEffect(() => {
    // Don't fetch if not signed in (prevents API calls during logout)
    if (!isSignedIn) {
      return;
    }
    if (!brandId && !organizationId) {
      return;
    }

    const fetchData = async () => {
      await Promise.all([findAnalytics(), findAllVideos(), findTimeSeries()]);
    };

    fetchData();
  }, [
    isSignedIn,
    brandId,
    organizationId,
    findAnalytics,
    findAllVideos,
    findTimeSeries,
  ]);

  const handleExport = async (format: 'csv' | 'xlsx', fields: string[]) => {
    const url = 'POST /analytics/export';

    try {
      const service = await getAnalyticsService();

      const query: {
        brand?: string;
        organization?: string;
      } = {};

      if (brandId) {
        query.brand = brandId;
      }

      if (organizationId) {
        query.organization = organizationId;
      }

      const response = await service.exportData(format, fields, query);

      const blob = new Blob([response], {
        type:
          format === 'csv'
            ? 'text/csv'
            : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });

      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = `analytics-export.${format}`;
      document.body.appendChild(link);

      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(downloadUrl);

      notificationsService.success('Data exported successfully');
      logger.info(`${url} success`);
    } catch (error) {
      notificationsService.error('Failed to export data');
      logger.error(`${url} failed`, error);
    }
  };

  return (
    <Container
      label="Analytics"
      description="Performance, engagement, and growth metrics."
      icon={HiOutlineChartBar}
      right={
        <Button
          tooltip="Export"
          icon={<HiArrowDownTray />}
          onClick={() => openExport({ onExport: handleExport })}
          variant={ButtonVariant.SECONDARY}
        />
      }
    >
      <AnalyticsKPISection isLoading={isLoading} stats={stats} />

      <AnalyticsViewsChart
        timeSeriesData={timeSeriesData}
        isTimeSeriesLoading={isTimeSeriesLoading}
      />

      <AnalyticsRecentVideos recentVideos={recentVideos} />
    </Container>
  );
}
