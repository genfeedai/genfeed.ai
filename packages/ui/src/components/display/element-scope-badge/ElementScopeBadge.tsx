import Badge from '@ui/display/badge/Badge';
import { useTranslations } from 'next-intl';

interface ElementScopeBadgeProps {
  isActive?: boolean;
  isPlatformDefault?: boolean;
}

/** Marks an element as platform default or organization-owned, and inactive. */
export default function ElementScopeBadge({
  isActive = true,
  isPlatformDefault = false,
}: ElementScopeBadgeProps) {
  const translate = useTranslations('ui.elementPlatformFields');

  return (
    <div className="flex flex-wrap gap-2">
      <Badge variant={isPlatformDefault ? 'primary' : 'outline'}>
        {translate(isPlatformDefault ? 'scopePlatform' : 'scopeOrganization')}
      </Badge>
      {isActive ? null : (
        <Badge variant="warning">{translate('inactive')}</Badge>
      )}
    </div>
  );
}
