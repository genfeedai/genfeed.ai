'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import Card from '@ui/card/Card';
import { Button } from '@ui/primitives/button';
import { RotateCcw } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRailPreferencesContext } from '@/components/shell/rail-preferences.provider';

/** Settings → Personal: put the rail back on the organization's order. */
export default function SettingsRailCard() {
  const translate = useTranslations('common.settings.profile.rail');
  const { isLoaded, resetRail } = useRailPreferencesContext();

  return (
    <Card label={translate('label')}>
      <div>
        <Button
          data-testid="personal-rail-reset"
          icon={<RotateCcw aria-hidden="true" />}
          isDisabled={!isLoaded}
          label={translate('reset')}
          onClick={resetRail}
          size={ButtonSize.SM}
          variant={ButtonVariant.SECONDARY}
        />
      </div>
    </Card>
  );
}
