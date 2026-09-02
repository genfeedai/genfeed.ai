'use client';

import { ButtonVariant, OrganizationCategory } from '@genfeedai/contracts';
import { Button } from '@ui/primitives/button';
import { Briefcase, CircleUser, Users } from 'lucide-react';

const ACCOUNT_TYPES = [
  {
    category: OrganizationCategory.CREATOR,
    description: 'Individual content creator or influencer',
    icon: CircleUser,
    label: 'Creator',
  },
  {
    category: OrganizationCategory.BUSINESS,
    description: 'Company, brand, or e-commerce store',
    icon: Briefcase,
    label: 'Business',
  },
  {
    category: OrganizationCategory.AGENCY,
    description: 'Managing content for multiple clients',
    icon: Users,
    label: 'Agency',
  },
];

type Props = {
  accountType: OrganizationCategory | null;
  onSelect: (category: OrganizationCategory) => void;
};

export default function BrandAccountTypeSelector({
  accountType,
  onSelect,
}: Props) {
  return (
    <div className="step-form max-w-md mb-8">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
        I am a…
      </p>
      <div className="grid grid-cols-3 gap-3">
        {ACCOUNT_TYPES.map(({ category, description, icon: Icon, label }) => (
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
              {label}
            </span>
            <span className="text-2xs text-gray-800 leading-tight block mt-1">
              {description}
            </span>
          </Button>
        ))}
      </div>
    </div>
  );
}
