'use client';

import ButtonRefresh from '@components/buttons/refresh/button-refresh/ButtonRefresh';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import type { LayoutProps } from '@props/layout/layout.props';
import Container from '@ui/layout/container/Container';
import { Image } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function GenerationsLayout({ children }: LayoutProps) {
  const { refresh } = useRouter();
  const [isRefreshing, setIsRefreshing] = useState(false);

  function handleRefresh(): void {
    setIsRefreshing(true);
    refresh();
    setTimeout(() => setIsRefreshing(false), 500);
  }

  return (
    <Container
      label="Generations"
      description="Inspect generated images with original, enhanced, and compiled prompts"
      icon={Image}
      headerTabs={{
        fullWidth: false,
        tabs: [
          { href: APP_ROUTES.ADMIN.CONTENT.GENERATIONS, label: 'Generations' },
          { href: APP_ROUTES.ADMIN.CONTENT.PROMPTS_LIST, label: 'Prompts' },
        ],
      }}
      right={
        <ButtonRefresh onClick={handleRefresh} isRefreshing={isRefreshing} />
      }
    >
      {children}
    </Container>
  );
}
