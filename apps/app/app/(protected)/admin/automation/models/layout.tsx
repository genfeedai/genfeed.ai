'use client';

import ButtonRefresh from '@components/buttons/refresh/button-refresh/ButtonRefresh';
import { APP_ROUTES } from '@genfeedai/constants';
import { ButtonVariant, ModalEnum } from '@genfeedai/enums';
import { openModal } from '@helpers/ui/modal/modal.helper';
import type { LayoutProps } from '@props/layout/layout.props';
import Container from '@ui/layout/container/Container';
import { Button } from '@ui/primitives/button';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { HiOutlineCpuChip, HiPlus } from 'react-icons/hi2';

export default function ModelsLayout({ children }: LayoutProps) {
  const { refresh } = useRouter();
  const [isRefreshing, setIsRefreshing] = useState(false);

  function handleRefresh(): void {
    setIsRefreshing(true);
    refresh();
    setTimeout(() => setIsRefreshing(false), 500);
  }

  return (
    <Container
      label="Models"
      description="Manage AI models, their configurations, and availability settings"
      icon={HiOutlineCpuChip}
      tabs={[
        { href: `${APP_ROUTES.ADMIN.AUTOMATION.MODELS}/all`, label: 'All' },
        { href: `${APP_ROUTES.ADMIN.AUTOMATION.MODELS}/image`, label: 'Image' },
        { href: `${APP_ROUTES.ADMIN.AUTOMATION.MODELS}/video`, label: 'Video' },
        { href: `${APP_ROUTES.ADMIN.AUTOMATION.MODELS}/music`, label: 'Music' },
        { href: `${APP_ROUTES.ADMIN.AUTOMATION.MODELS}/text`, label: 'Text' },
        { href: `${APP_ROUTES.ADMIN.AUTOMATION.MODELS}/other`, label: 'Other' },
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
