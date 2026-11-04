import { Badge } from '@ui/primitives/badge';
import { useTranslations } from 'next-intl';

export const CURRENT_RING = 'ring-1 ring-border-strong';

export default function CurrentBadge() {
  const translate = useTranslations('common.onboarding');

  return (
    <Badge className="absolute -top-2 right-3 z-10" variant="secondary">
      {translate('current')}
    </Badge>
  );
}
