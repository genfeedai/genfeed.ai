'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import Card from '@ui/card/Card';
import { Button } from '@ui/primitives/button';
import { RotateCcw } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRailPreferencesContext } from '@/components/shell/rail-preferences.provider';

/**
 * Settings → Personal: put the rail back on the organization's order. The
 * same reset the rail's More menu offers, for members who look in settings.
 */
export default function SettingsRailCard() {
  const translate = useTranslations('common.settings.profile.rail');
  const translateRail = useTranslations('common.appRail');
  const { isLoaded, resetRail } = useRailPreferencesContext();

  return (
    <Card
      bodyClassName="gap-3 p-4"
      description={translate('description')}
      label={translate('label')}
    >
      <div>
        <Button
          data-testid="personal-rail-reset"
          icon={<RotateCcw aria-hidden="true" />}
          isDisabled={!isLoaded}
          label={translateRail('reset')}
          onClick={resetRail}
          size={ButtonSize.SM}
          variant={ButtonVariant.SECONDARY}
        />
      </div>
    </Card>
  );
}
