'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import {
  ButtonSize,
  ButtonVariant,
  ContentCampaignStatus,
} from '@genfeedai/contracts';
import {
  APP_ROUTES,
  createPublishingCampaignRoute,
} from '@genfeedai/contracts/constants';
import { DATE_FORMATS, formatDate } from '@helpers/formatting/date/date.helper';
import { useCampaigns } from '@hooks/data/campaigns/use-campaigns';
import { useCollectionScope } from '@hooks/navigation/use-collection-scope/use-collection-scope';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import {
  CAMPAIGN_STATUS_FILTERS,
  CAMPAIGN_STATUS_LABELS,
  parseCampaignStatusFilter,
} from '@pages/campaigns/campaigns-status';
import type { TableColumn, TableRowLink } from '@props/ui/display/table.props';
import type { Campaign } from '@services/content/campaigns.service';
import Badge from '@ui/display/badge/Badge';
import AppTable from '@ui/display/table/Table';
import Container from '@ui/layout/container/Container';
import Pagination from '@ui/navigation/pagination/Pagination';
import { Button } from '@ui/primitives/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import { Flag, Plus } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';

function formatCampaignDate(value?: string | null): string {
  if (!value) {
    return '—';
  }
  return formatDate(value, DATE_FORMATS.DISPLAY_DATE) || '—';
}

export default function CampaignsListPage() {
  const translate = useTranslations('pages.publishing.campaigns');
  const collectionScope = useCollectionScope();
  const { brands } = useBrand();
  const { href } = useOrgUrl();
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const status = parseCampaignStatusFilter(searchParams?.get('status'));
  const parsedPage = Number.parseInt(searchParams?.get('page') ?? '1', 10);
  const page = Number.isFinite(parsedPage) ? Math.max(1, parsedPage) : 1;
  const { campaigns, isLoading, isError, refetch, totalPages } = useCampaigns({
    page,
    status,
  });
  const brandLabels = useMemo(() => {
    return new Map(brands.map((brand) => [brand.id, brand.label]));
  }, [brands]);
  const showBrandColumn = collectionScope.pageScope === 'org';

  const columns = useMemo((): TableColumn<Campaign>[] => {
    const nameColumn: TableColumn<Campaign> = {
      header: translate('columns.name'),
      key: 'name',
    };
    const brandColumn: TableColumn<Campaign> = {
      header: translate('columns.brand'),
      key: 'brandId',
      render: (campaign) => brandLabels.get(campaign.brandId) ?? '—',
    };
    return [
      nameColumn,
      ...(showBrandColumn ? [brandColumn] : []),
      {
        header: translate('columns.objective'),
        key: 'objective',
        render: (campaign) => campaign.objective || '—',
      },
      {
        header: translate('columns.dates'),
        key: 'startDate',
        render: (campaign) => {
          if (!campaign.startDate && !campaign.endDate) {
            return '—';
          }
          return `${formatCampaignDate(campaign.startDate)} – ${formatCampaignDate(campaign.endDate)}`;
        },
      },
      {
        header: translate('columns.status'),
        key: 'status',
        render: (campaign) => (
          <Badge status={campaign.status}>
            {CAMPAIGN_STATUS_LABELS[campaign.status] ?? campaign.status}
          </Badge>
        ),
      },
    ];
  }, [brandLabels, showBrandColumn, translate]);

  function getRowLink(campaign: Campaign): TableRowLink {
    return {
      href: href(createPublishingCampaignRoute(campaign.id)),
      label: translate('openCampaign', { name: campaign.name }),
    };
  }

  function replaceStatus(nextStatus: string): void {
    const params = new URLSearchParams(searchParams?.toString() ?? '');
    if (nextStatus === 'all') {
      params.delete('status');
    } else {
      params.set('status', nextStatus);
    }
    params.delete('page');
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : (pathname ?? ''), {
      scroll: false,
    });
  }

  function replacePage(nextPage: number): void {
    const params = new URLSearchParams(searchParams?.toString() ?? '');
    const clampedPage = Math.min(
      Math.max(nextPage, 1),
      Math.max(totalPages, 1),
    );
    if (clampedPage === 1) {
      params.delete('page');
    } else {
      params.set('page', String(clampedPage));
    }
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : (pathname ?? ''), {
      scroll: false,
    });
  }

  return (
    <Container
      description={translate('listDescription')}
      icon={Flag}
      label={translate('title')}
      right={
        <div className="flex items-center gap-2">
          <Select onValueChange={replaceStatus} value={status ?? 'all'}>
            <SelectTrigger
              aria-label={translate('statusFilter')}
              className="min-w-36"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CAMPAIGN_STATUS_FILTERS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button asChild size={ButtonSize.SM} variant={ButtonVariant.DEFAULT}>
            <Link href={href(APP_ROUTES.PUBLISHING.CAMPAIGNS_NEW)}>
              <Plus className="size-4" />
              {translate('newCampaign')}
            </Link>
          </Button>
        </div>
      }
      titleVisibility="sr-only"
    >
      <AppTable<Campaign>
        error={
          isError
            ? {
                title: translate('loadError'),
                onRetry: () => refetch(),
              }
            : undefined
        }
        columns={columns}
        emptyLabel={
          status === ContentCampaignStatus.ARCHIVED
            ? translate('emptyArchived')
            : translate('empty')
        }
        getRowKey={(campaign) => campaign.id}
        getRowLink={getRowLink}
        isLoading={isLoading}
        items={campaigns}
        label={translate('title')}
      />
      {totalPages > 1 ? (
        <div className="mt-4">
          <Pagination
            currentPage={page}
            onPageChange={replacePage}
            totalPages={totalPages}
          />
        </div>
      ) : null}
    </Container>
  );
}
