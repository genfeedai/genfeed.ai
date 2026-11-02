'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { Button } from '@ui/primitives/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@ui/primitives/dropdown-menu';
import { ChevronDown } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type {
  BrandKitPreviewMenuProps,
  BrandPreviewSource,
  BrandPreviewTemplate,
} from '@/features/brands/props/brand-kit-workspace.props';

const SOURCES: readonly BrandPreviewSource[] = ['draft', 'approved'];
const TEMPLATES: readonly BrandPreviewTemplate[] = [
  'social',
  'cover',
  'profile',
];

function isPreviewSource(value: string): value is BrandPreviewSource {
  return SOURCES.some((source) => source === value);
}

function isPreviewTemplate(value: string): value is BrandPreviewTemplate {
  return TEMPLATES.some((template) => template === value);
}

/**
 * The one preview control: which identity to show (draft or approved) and
 * which template to show it on. A ghost dropdown in the subbar, like every
 * other view switcher.
 */
export default function BrandKitPreviewMenu({
  isApprovedAvailable,
  onSourceChange,
  onTemplateChange,
  source,
  template,
}: BrandKitPreviewMenuProps) {
  const t = useTranslations('pages.brandKitSettings.preview');
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          ariaLabel={t('menuLabel')}
          className="h-8 shrink-0 gap-1 px-2 text-xs"
          size={ButtonSize.SM}
          variant={ButtonVariant.GHOST}
          withWrapper={false}
        >
          <span>{`${t(source)} · ${t(template)}`}</span>
          <ChevronDown aria-hidden="true" className="!size-3 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuLabel>{t('sourceLabel')}</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={source}
          onValueChange={(next) => {
            if (isPreviewSource(next)) onSourceChange(next);
          }}
        >
          {SOURCES.map((option) => (
            <DropdownMenuRadioItem
              disabled={option === 'approved' && !isApprovedAvailable}
              key={option}
              value={option}
            >
              {t(option)}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>{t('templateLabel')}</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={template}
          onValueChange={(next) => {
            if (isPreviewTemplate(next)) onTemplateChange(next);
          }}
        >
          {TEMPLATES.map((option) => (
            <DropdownMenuRadioItem key={option} value={option}>
              {t(option)}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
