'use client';

import { useAuth } from '@clerk/nextjs';
import type { IAnalytics } from '@genfeedai/interfaces';
import { useBrand } from '@contexts/user/brand-context/brand-context';
import {
  AnalyticsMetric,
  ButtonVariant,
  IngredientCategory,
  Status,
} from '@genfeedai/enums';
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
import { TimeSeriesChart } from '@ui/analytics/charts/time-series/time-series-chart';
import Button from '@ui/buttons/base/Button';
import Card from '@ui/card/Card';
import KPISection from '@ui/kpi/kpi-section/KPISection';
import Container from '@ui/layout/container/Container';
import { LazyMasonryVideo } from '@ui/lazy/masonry/LazyMasonry';
import { useCallback, useEffect, useState } from 'react';
import {
  HiArrowDownTray,
  HiEye,
  HiOutlineChartBar,
  HiUserCircle,
  HiVideoCamera,
} from 'react-icons/hi2';

export default function AnalyticsList({}: ContentProps) {
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
  const [timeSeriesData, setTimeSeriesData] = useState<any[]>([]);

  const [stats, setStats] = useState<IAnalytics>({
    monthlyGrowth: 0,
    totalCredentialsConnected: 0,
    totalPosts: 0,
    totalViews: 0,
    viewsGrowth: 0,
  });

  const boxes = [
    {
      description:
        stats.monthlyGrowth !== undefined
          ? `${stats.monthlyGrowth > 0 ? '+' : ''}${stats.monthlyGrowth}% from last month`
          : 'No growth data',
      icon: <HiVideoCamera className="text-2xl text-primary" />,
      label: 'Total Posts',
      value: stats.totalPosts,
    },
    {
      description:
        stats.viewsGrowth !== undefined
          ? `${stats.viewsGrowth > 0 ? '+' : ''}${stats.viewsGrowth}% from last month`
          : 'No growth data',
      icon: <HiEye className="text-2xl" />,
      label: 'Total Views',
      value: stats.totalViews,
    },
    {
      description: 'YouTube, TikTok, Instagram',
      icon: <HiUserCircle className="text-2xl text-white" />,
      label: 'Connected Accounts',
      value: stats.totalCredentialsConnected,
    },
  ];

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
      const query: Record<string, any> = {
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

      let data: any[] = [];

      if (brandId) {
        const service = await getBrandsService();
        data = await service.findBrandAnalyticsTimeSeries(brandId, query);
      } else if (organizationId) {
        const service = await getOrganizationsService();
        data = await service.findOrganizationAnalyticsTimeSeries(
          organizationId,
          query,
        );
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
      await findAnalytics();
      await findAllVideos();
      await findTimeSeries();
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

      const query: Record<string, any> = {};

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
      <KPISection
        title="Analytics Overview"
        isLoading={isLoading}
        gridCols={{ desktop: 3, mobile: 1, tablet: 2 }}
        className="bg-background"
        items={[
          {
            description: boxes[0].description,
            icon: HiVideoCamera,
            iconClassName: 'bg-white/10 text-foreground',
            label: boxes[0].label,
            value: boxes[0].value,
          },
          {
            description: boxes[1].description,
            icon: HiEye,
            iconClassName: 'bg-white/10 text-foreground',
            label: boxes[1].label,
            value: boxes[1].value,
          },
          {
            description: boxes[2].description,
            icon: HiUserCircle,
            iconClassName: 'bg-white/10 text-foreground',
            label: boxes[2].label,
            value: boxes[2].value,
          },
        ]}
      />

      <div className="grid grid-cols-1 gap-4 mb-6">
        <Card className="lg:col-span-2">
          <h2 className="text-lg font-semibold mb-4">Views Performance</h2>
          <TimeSeriesChart
            data={timeSeriesData}
            metrics={[AnalyticsMetric.VIEWS]}
            isLoading={isTimeSeriesLoading}
            height={320}
          />
        </Card>
      </div>

      {recentVideos.length > 0 && (
        <Card>
          <div className="flex justify-between items-center mb-6">
            <div>
              <h2 className="text-2xl font-bold">Recent Videos</h2>
              <p className="text-sm text-foreground/60 mt-1">
                Your latest video creations with performance metrics
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-5 gap-2">
            {recentVideos.map((video: Video, index: number) => (
              <div
                key={video.id}
                className="break-inside-avoid"
                style={{ animationDelay: `${index * 50}ms` }}
              >
                <div className="relative group">
                  <LazyMasonryVideo video={video} isActionsEnabled={false} />
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </Container>
  );
}
