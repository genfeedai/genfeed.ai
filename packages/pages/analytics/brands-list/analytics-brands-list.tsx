'use client';

import { useAuth } from '@clerk/nextjs';
import { useAnalyticsContext } from '@contexts/analytics/analytics-context';
import { ITEMS_PER_PAGE } from '@genfeedai/constants';
import { AnalyticsMetric } from '@genfeedai/enums';
import { getDateRangeWithDefaults } from '@helpers/utils/date-range.util';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import {
  AnalyticsService,
  type IBrandWithStats,
} from '@services/analytics/analytics.service';
import Table from '@ui/display/table/Table';
import Container from '@ui/layout/container/Container';
import { Input } from '@ui/primitives/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { HiArrowRight, HiOutlineBuildingOffice2 } from 'react-icons/hi2';

export interface AnalyticsBrandsListProps {
  basePath?: string;
}

const MAX_BRANDS_ANALYTICS_LIMIT = 100;

export default function AnalyticsBrandsList({
  basePath = '/analytics',
}: AnalyticsBrandsListProps) {
  const { isSignedIn } = useAuth();
  const router = useRouter();
  const { dateRange, refreshTrigger } = useAnalyticsContext();
  const getAnalyticsService = useAuthedService((token: string) =>
    AnalyticsService.getInstance(token),
  );

  const [brandsData, setBrandsData] = useState<IBrandWithStats[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<
    AnalyticsMetric.ENGAGEMENT | AnalyticsMetric.VIEWS | AnalyticsMetric.POSTS
  >(AnalyticsMetric.ENGAGEMENT);

  useEffect(() => {
    // Refresh nonce from analytics context: force refetch when refresh button is pressed
    if (refreshTrigger < 0) {
      return;
    }

    const fetchBrandsData = async () => {
      // Don't fetch if not signed in (prevents API calls during logout)
      if (!isSignedIn) {
        return;
      }
      if (!dateRange.startDate || !dateRange.endDate) {
        return;
      }

      setIsLoading(true);
      try {
        const service = await getAnalyticsService();
        const { startDate, endDate } = getDateRangeWithDefaults(
          dateRange?.startDate ?? undefined,
          dateRange?.endDate ?? undefined,
        );
        const response = await service.getBrandsWithStats({
          endDate,
          limit: Math.min(ITEMS_PER_PAGE * 8, MAX_BRANDS_ANALYTICS_LIMIT),
          page: 1,
          sort: sortBy,
          startDate,
        });
        setBrandsData(response.data);
      } catch {
        // Error handling
      } finally {
        setIsLoading(false);
      }
    };

    fetchBrandsData();
  }, [isSignedIn, dateRange, refreshTrigger, sortBy, getAnalyticsService]);

  const filteredBrands = brandsData.filter((brand) =>
    brand.name.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  const formatNumber = (num: number) => {
    return new Intl.NumberFormat('en-US', { notation: 'compact' }).format(num);
  };

  const formatPercentage = (num: number) => {
    return `${num.toFixed(2)}%`;
  };

  return (
    <Container
      label="All Brands"
      description={`${filteredBrands.length} brand${filteredBrands.length !== 1 ? 's' : ''} found`}
      icon={HiOutlineBuildingOffice2}
      right={
        <div className="flex items-center gap-2">
          <Input
            type="text"
            placeholder="Search brands..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full sm:w-64"
          />

          <Select
            value={sortBy}
            onValueChange={(value) =>
              setSortBy(
                value as
                  | AnalyticsMetric.ENGAGEMENT
                  | AnalyticsMetric.VIEWS
                  | AnalyticsMetric.POSTS,
              )
            }
          >
            <SelectTrigger className="w-full sm:w-44">
              <SelectValue placeholder="Sort by" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={AnalyticsMetric.ENGAGEMENT}>
                Sort by Engagement
              </SelectItem>
              <SelectItem value={AnalyticsMetric.VIEWS}>
                Sort by Views
              </SelectItem>
              <SelectItem value={AnalyticsMetric.POSTS}>
                Sort by Posts
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      }
    >
      <div className="bg-background p-6">
        <div className="overflow-x-auto">
          <Table
            items={filteredBrands}
            isLoading={isLoading}
            emptyLabel={
              searchTerm ? 'No brands match your search' : 'No brands found'
            }
            getRowKey={(brand) => brand.id}
            onRowClick={(brand) => router.push(`/analytics/brands/${brand.id}`)}
            columns={[
              {
                header: 'Brand',
                key: 'name',
                render: (brand) => (
                  <div className="flex items-center gap-3">
                    {brand.logo ? (
                      <Image
                        src={brand.logo}
                        alt={brand.name}
                        width={40}
                        height={40}
                        className="w-10 h-10 rounded-full object-cover"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-primary font-semibold text-lg">
                        {brand.name.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div>
                      <div className="font-medium">{brand.name}</div>
                      <div className="text-xs text-foreground/60">
                        {brand.organizationName}
                      </div>
                      <div className="text-xs text-foreground/50 mt-0.5">
                        {brand.activePlatforms.length} platform
                        {brand.activePlatforms.length !== 1 ? 's' : ''}
                      </div>
                    </div>
                  </div>
                ),
              },
              {
                header: 'Posts',
                key: 'totalPosts',
                render: (brand) => (
                  <div className="text-center">
                    <div className="font-mono font-semibold">
                      {formatNumber(brand.totalPosts)}
                    </div>
                    <div className="text-xs text-foreground/50">published</div>
                  </div>
                ),
              },
              {
                header: 'Views',
                key: 'totalViews',
                render: (brand) => (
                  <div className="text-center">
                    <div className="font-mono font-semibold">
                      {formatNumber(brand.totalViews)}
                    </div>
                    <div className="text-xs text-foreground/50">total</div>
                  </div>
                ),
              },
              {
                header: 'Engagement',
                key: 'totalEngagement',
                render: (brand) => (
                  <div className="text-center">
                    <div className="font-mono font-semibold">
                      {formatNumber(brand.totalEngagement)}
                    </div>
                    <div className="text-xs text-foreground/50">
                      interactions
                    </div>
                  </div>
                ),
              },
              {
                header: 'Eng. Rate',
                key: 'avgEngagementRate',
                render: (brand) => (
                  <div className="text-center">
                    <div className="font-mono font-semibold">
                      {formatPercentage(brand.avgEngagementRate)}
                    </div>
                    <div className="text-xs text-foreground/50">average</div>
                  </div>
                ),
              },
              {
                header: 'Growth',
                key: 'growth',
                render: (brand) => (
                  <div className="text-center">
                    <div
                      className={`font-mono font-semibold ${
                        brand.growth > 0
                          ? 'text-success'
                          : brand.growth < 0
                            ? 'text-error'
                            : ''
                      }`}
                    >
                      {brand.growth > 0 ? '+' : ''}
                      {formatPercentage(brand.growth)}
                    </div>
                    <div className="text-xs text-foreground/50">
                      vs last period
                    </div>
                  </div>
                ),
              },
            ]}
            actions={[
              {
                icon: <HiArrowRight className="w-4 h-4" />,
                onClick: (brand) =>
                  router.push(`${basePath}/brands/${brand.id}`),
                tooltip: 'View Brand Details',
              },
            ]}
          />
        </div>
      </div>
    </Container>
  );
}
