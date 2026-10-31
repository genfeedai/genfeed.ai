'use client';

import { useAdminSearchParam } from '@ui/content/admin-filters/useAdminSearchParam';
import SearchField from '@ui/content/search-field/SearchField';
import Container from '@ui/layout/container/Container';
import { MessageSquareText } from 'lucide-react';
import type { ReactNode } from 'react';
import LibraryAssetTypeFilter from '@/features/ingredients/layout/library-asset-type-filter';

export default function LibraryCaptionsPage({
  children,
}: {
  children: ReactNode;
}) {
  const { search, setSearch } = useAdminSearchParam();

  return (
    <Container
      label="Captions"
      icon={MessageSquareText}
      leading={
        <SearchField
          ariaLabel="Search captions"
          onSearch={setSearch}
          placeholder="Search captions"
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
