import { ButtonVariant, OrganizationCategory } from '@genfeedai/contracts';
import type { BrandAccountTypeSelectorProps } from '@props/onboarding/brand-account-type-selector.props';
import { Button } from '@ui/primitives/button';
import { Briefcase, CircleUser, GraduationCap, Users } from 'lucide-react';
import { useTranslations } from 'next-intl';

const ACCOUNT_TYPES = [
  { category: OrganizationCategory.CREATOR, icon: CircleUser, key: 'creator' },
  { category: OrganizationCategory.BUSINESS, icon: Briefcase, key: 'business' },
  { category: OrganizationCategory.AGENCY, icon: Users, key: 'agency' },
  { category: OrganizationCategory.EXPERT, icon: GraduationCap, key: 'expert' },
] as const;

export default function BrandAccountTypeSelector({
  accountType,
  onSelect,
}: BrandAccountTypeSelectorProps) {
  const translate = useTranslations('pages.onboarding.brand.accountTypes');

  return (
    <div className="step-form max-w-2xl mb-8">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
        {translate('title')}
      </p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {ACCOUNT_TYPES.map(({ category, icon: Icon, key }) => (
          <Button
            key={category}
            variant={ButtonVariant.UNSTYLED}
            withWrapper={false}
            onClick={() => onSelect(category)}
            className={`group rounded-none p-4 border text-center transition-colors ${
              accountType === category
                ? 'border-border-strong bg-hover'
                : 'border-border bg-background-tertiary hover:border-border-strong hover:bg-hover'
            }`}
          >
            <Icon
              className={`h-6 w-6 mx-auto mb-2 transition-colors ${
                accountType === category
                  ? 'text-foreground'
                  : 'text-gray-800 group-hover:text-foreground'
              }`}
            />
            <span
              className={`text-sm font-medium block ${
                accountType === category
                  ? 'text-foreground'
                  : 'text-muted-foreground'
              }`}
            >
              {translate(`${key}.label`)}
            </span>
            <span className="text-2xs text-gray-800 leading-tight block mt-1">
              {translate(`${key}.description`)}
            </span>
          </Button>
        ))}
      </div>
    </div>
  );
}
