'use client';

import { useAdminSearchParam } from '@ui/content/admin-filters/useAdminSearchParam';
import SearchField from '@ui/content/search-field/SearchField';
import Container from '@ui/layout/container/Container';
import { MessageSquareText } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import LibraryAssetTypeFilter from '@/features/ingredients/layout/library-asset-type-filter';

export default function LibraryCaptionsPage({
  children,
}: {
  children: ReactNode;
}) {
  const translate = useTranslations('common.listSearch');
  const { search, setSearch } = useAdminSearchParam();

  return (
    <Container
      label="Captions"
      icon={MessageSquareText}
      leading={
        <SearchField
          ariaLabel={translate('captions')}
          onSearch={setSearch}
          placeholder={translate('captions')}
          value={search}
        />
      }
      right={<LibraryAssetTypeFilter />}
      titleVisibility="sr-only"
    >
      {children}
    </Container>
  );
}
