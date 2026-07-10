'use client';

import { ButtonVariant, OrganizationCategory } from '@genfeedai/enums';
import { Button } from '@ui/primitives/button';
import { HiBriefcase, HiUserCircle, HiUserGroup } from 'react-icons/hi2';

const ACCOUNT_TYPES = [
  {
    category: OrganizationCategory.CREATOR,
    description: 'Individual content creator or influencer',
    icon: HiUserCircle,
    label: 'Creator',
  },
  {
    category: OrganizationCategory.BUSINESS,
    description: 'Company, brand, or e-commerce store',
    icon: HiBriefcase,
    label: 'Business',
  },
  {
    category: OrganizationCategory.AGENCY,
    description: 'Managing content for multiple clients',
    icon: HiUserGroup,
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
    <div className="step-form opacity-0 max-w-md mb-8">
      <p className="text-xs font-medium text-white/50 uppercase tracking-wider mb-3">
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
                ? 'border-white/30 bg-white/[0.08]'
                : 'border-white/[0.08] bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.04]'
            }`}
          >
            <Icon
              className={`h-6 w-6 mx-auto mb-2 transition-colors ${
                accountType === category
                  ? 'text-white'
                  : 'text-white/40 group-hover:text-white/70'
              }`}
            />
            <span
              className={`text-sm font-medium block ${
                accountType === category ? 'text-white' : 'text-white/60'
              }`}
            >
              {label}
            </span>
            <span className="text-[10px] text-white/30 leading-tight block mt-1">
              {description}
            </span>
          </Button>
        ))}
      </div>
    </div>
  );
}
