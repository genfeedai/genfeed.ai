'use client';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import { useTranslations } from 'next-intl';
import { ECONOMICS_PERIOD_DAYS } from './economics-report.util';

interface EconomicsPeriodSelectProps {
  onChange: (days: string) => void;
  value: string;
}

export default function EconomicsPeriodSelect({
  onChange,
  value,
}: EconomicsPeriodSelectProps) {
  const translate = useTranslations('pages.adminEconomics');

  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-40" aria-label={translate('periodLabel')}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {ECONOMICS_PERIOD_DAYS.map((days) => (
          <SelectItem key={days} value={String(days)}>
            {translate('period', { days })}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
