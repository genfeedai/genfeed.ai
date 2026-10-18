'use client';

import { ButtonSize, ButtonVariant, ModalEnum } from '@genfeedai/contracts';
import { openModal } from '@helpers/ui/modal/modal.helper';
import { Button } from '@ui/primitives/button';
import { SHELL_ICON_CLASS } from '@ui-constants/shell-chrome.constant';
import { Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';

/** The Models page's primary action. The org filter is a shell dropdown. */
export default function AdminModelsActions() {
  const translate = useTranslations('pages.models');

  return (
    <Button
      ariaLabel={translate('newModel')}
      icon={<Plus className={SHELL_ICON_CLASS} />}
      onClick={() => openModal(ModalEnum.MODEL)}
      size={ButtonSize.SM}
      variant={ButtonVariant.DEFAULT}
      withWrapper={false}
    >
      {translate('model')}
    </Button>
  );
}
