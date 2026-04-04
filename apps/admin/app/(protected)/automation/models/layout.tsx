'use client';

import ButtonRefresh from '@components/buttons/refresh/button-refresh/ButtonRefresh';
import { ButtonVariant, ModalEnum } from '@genfeedai/enums';
import { openModal } from '@helpers/ui/modal/modal.helper';
import type { LayoutProps } from '@props/layout/layout.props';
import Container from '@ui/layout/container/Container';
import { Button } from '@ui/primitives/button';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { HiOutlineCpuChip, HiPlus } from 'react-icons/hi2';

export default function ModelsLayout({ children }: LayoutProps) {
  const router = useRouter();
  const [isRefreshing, setIsRefreshing] = useState(false);

  function handleRefresh(): void {
    setIsRefreshing(true);
    router.refresh();
    setTimeout(() => setIsRefreshing(false), 500);
  }

  return (
    <Container
      label="Models"
      description="Manage AI models, their configurations, and availability settings"
      icon={HiOutlineCpuChip}
      tabs={[
        { href: '/automation/models/all', label: 'All' },
        { href: '/automation/models/image', label: 'Image' },
        { href: '/automation/models/video', label: 'Video' },
        { href: '/automation/models/music', label: 'Music' },
        { href: '/automation/models/text', label: 'Text' },
        { href: '/automation/models/other', label: 'Other' },
      ]}
      right={
        <>
          <ButtonRefresh onClick={handleRefresh} isRefreshing={isRefreshing} />
          <Button
            variant={ButtonVariant.DEFAULT}
            onClick={() => openModal(ModalEnum.MODEL)}
          >
            <HiPlus />
            Model
          </Button>
        </>
      }
    >
      {children}
    </Container>
  );
}
