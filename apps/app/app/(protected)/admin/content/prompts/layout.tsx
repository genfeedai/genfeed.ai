'use client';

import ButtonRefresh from '@components/buttons/refresh/button-refresh/ButtonRefresh';
import type { LayoutProps } from '@props/layout/layout.props';
import Container from '@ui/layout/container/Container';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { HiCommandLine } from 'react-icons/hi2';

export default function PromptsLayout({ children }: LayoutProps) {
  const router = useRouter();
  const [isRefreshing, setIsRefreshing] = useState(false);

  function handleRefresh(): void {
    setIsRefreshing(true);
    router.refresh();
    setTimeout(() => setIsRefreshing(false), 500);
  }

  return (
    <Container
      label="Prompts"
      description="Manage AI prompts and reusable templates"
      icon={HiCommandLine}
      tabs={[
        { href: '/content/prompts/list', label: 'Prompts' },
        { href: '/content/prompts/templates', label: 'Templates' },
      ]}
      right={
        <ButtonRefresh onClick={handleRefresh} isRefreshing={isRefreshing} />
      }
    >
      {children}
    </Container>
  );
}
