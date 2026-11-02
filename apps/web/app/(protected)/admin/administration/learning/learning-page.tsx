'use client';
import { useBrand } from '@contexts/user/brand-context/brand-context';
import AdminPageShell from '@ui/layout/admin-page-shell/AdminPageShell';
import { Cog } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef } from 'react';
import AdminOrgBrandUrlFilter, {
  useAdminOrgBrandParams,
} from '@/components/content/admin-filters/AdminOrgBrandUrlFilter';
import LearningReportPanel from '@/features/admin/learning/learning-report-panel';
import { useLearningReport } from '@/features/admin/learning/use-learning-report';

/**
 * Which prompt slots go with better or worse measured outcomes, for one
 * organization at a time. The organization and brand come from the shared
 * admin picker; with none chosen the page opens on the admin's own
 * organization so it shows a report instead of an empty form.
 */
export default function LearningPage() {
  const translate = useTranslations('pages.adminLearning');
  const { replace } = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchParamsString = searchParams?.toString() ?? '';
  const { brand, organization } = useAdminOrgBrandParams();
  const { organizationId: currentOrganizationId } = useBrand();
  const hasDefaulted = useRef(false);

  useEffect(() => {
    if (hasDefaulted.current) return;
    if (organization) {
      hasDefaulted.current = true;
      return;
    }
    if (!currentOrganizationId) return;
    hasDefaulted.current = true;
    const params = new URLSearchParams(searchParamsString);
    params.set('organization', currentOrganizationId);
    replace(`${pathname}?${params.toString()}`, { scroll: false });
  }, [
    currentOrganizationId,
    organization,
    pathname,
    replace,
    searchParamsString,
  ]);

  const { data, isError, isFetching, isLoading, refetch } = useLearningReport({
    brandId: brand,
    organizationId: organization,
  });
  const reload = useCallback(() => void refetch(), [refetch]);

  return (
    <AdminPageShell
      title={translate('title')}
      icon={Cog}
      dropdowns={<AdminOrgBrandUrlFilter />}
      onRefresh={organization ? reload : undefined}
      isRefreshing={isFetching}
    >
      <LearningReportPanel
        hasOrganization={organization !== ''}
        isError={isError}
        isLoading={isLoading}
        onRetry={reload}
        report={data}
      />
    </AdminPageShell>
  );
}
