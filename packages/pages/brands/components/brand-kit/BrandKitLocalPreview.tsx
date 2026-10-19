'use client';

import { FONT_FAMILY_METADATA, resolveFontFamily } from '@genfeedai/contracts';
import type { BrandKitFieldKey } from '@genfeedai/contracts/interfaces';
import { isRecord } from '@genfeedai/utils/data/extract.util';
import { getPlatformIcon } from '@helpers/ui/platform-icon/platform-icon.helper';
import type {
  BrandKitLocalPreviewProps,
  BrandPreviewColor,
  BrandPreviewSocialLink,
  BrandPreviewSurfaceProps,
  BrandPreviewTemplate,
} from '@props/pages/brand-kit-workspace.props';
import Tabs from '@ui/navigation/tabs/Tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

function hasPreviewValue(value: unknown): boolean {
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.some(hasPreviewValue);
  if (isRecord(value)) {
    if (
      typeof value.url === 'string' &&
      /^https?:\/\//u.test(value.url.trim())
    ) {
      return true;
    }
    return Object.values(value).some(hasPreviewValue);
  }
  return false;
}

function isPreviewHex(value: string): boolean {
  return /^#[\da-f]{3,8}$/iu.test(value) && [4, 5, 7, 9].includes(value.length);
}

function previewFontStyle(font: string): {
  fontFamily?: string;
  fontWeight?: number;
} {
  if (!font || font === 'inherit') return {};
  const known = resolveFontFamily(font);
  if (!known) return { fontFamily: font };
  const { cssFamily, cssWeight } = FONT_FAMILY_METADATA[known];
  return { fontFamily: `${cssFamily}, sans-serif`, fontWeight: cssWeight };
}

function readPreviewSocialLinks(value: unknown): BrandPreviewSocialLink[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!isRecord(entry) || typeof entry.url !== 'string') return [];
    const url = entry.url.trim();
    if (!/^https?:\/\//u.test(url)) return [];
    const platform =
      typeof entry.platform === 'string'
        ? entry.platform
        : typeof entry.category === 'string'
          ? entry.category.toLowerCase()
          : '';
    return platform ? [{ platform, url }] : [];
  });
}

const PREVIEW_FRAME_CLASS: Record<BrandPreviewTemplate, string> = {
  cover: 'aspect-video',
  profile: '',
  social: 'aspect-square',
};

function BrandPreviewSurface({
  colors,
  description,
  fontFamily,
  label,
  logoUrl,
  sample,
  slug,
  socialLinks,
  template,
}: BrandPreviewSurfaceProps) {
  return (
    <div
      className={`flex flex-col gap-4 rounded-card bg-card p-5 text-card-foreground shadow-border ${PREVIEW_FRAME_CLASS[template]}`}
      data-testid="brand-kit-preview-surface"
    >
      <div className="flex items-center gap-3">
        {logoUrl ? (
          <Image
            src={logoUrl}
            alt=""
            width={40}
            height={40}
            unoptimized
            className="size-10 object-contain"
          />
        ) : (
          <span className="flex size-10 items-center justify-center rounded-md border border-border text-sm font-medium">
            {label.slice(0, 1)}
          </span>
        )}
        <span className="text-sm font-medium">{label}</span>
      </div>
      {template === 'profile' ? (
        <p className="text-sm leading-relaxed">{description}</p>
      ) : (
        <div className="space-y-2">
          <p
            className="text-2xl font-semibold leading-tight"
            style={previewFontStyle(fontFamily)}
          >
            {sample}
          </p>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {description}
          </p>
        </div>
      )}
      {socialLinks.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {socialLinks.map((link) => (
            <li
              className="flex min-w-0 items-center gap-2 text-sm"
              key={`${link.platform}-${link.url}`}
            >
              <span aria-hidden="true" className="shrink-0">
                {getPlatformIcon(link.platform, 'size-4')}
              </span>
              <a
                className="min-w-0 truncate underline-offset-2 hover:underline"
                href={link.url}
                rel="noopener noreferrer"
                target="_blank"
              >
                {link.url}
              </a>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="mt-auto flex items-center justify-between gap-3">
        <p className="min-w-0 truncate text-xs text-muted-foreground">{slug}</p>
        {colors.length > 0 ? (
          <ul className="flex shrink-0 gap-1.5">
            {colors.map((color) => (
              <li key={color.key}>
                <span
                  className="block size-4 rounded-sm border border-border"
                  style={{ backgroundColor: color.value }}
                  title={color.value}
                />
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}

/** Pure browser rendering. Changing a preview never calls a generation service. */
export default function BrandKitLocalPreview({
  brand,
  content,
  approvedContent,
}: BrandKitLocalPreviewProps) {
  const t = useTranslations('pages.brandKitSettings.preview');
  const [source, setSource] = useState('draft');
  const [template, setTemplate] = useState<BrandPreviewTemplate>('social');
  const draft = source === 'approved' ? approvedContent : content;
  const fallbackBrand = source === 'approved' ? null : brand;
  function value(key: BrandKitFieldKey, fallback: unknown) {
    const field = draft?.fields[key];
    if (!field) return fallback;
    if (source === 'approved') {
      return field.applyActionDefault === 'preserve' ||
        field.applyActionDefault === 'reject'
        ? (field.currentValue ?? fallback)
        : (field.proposedValue ?? field.currentValue ?? fallback);
    }
    if (field.applyActionDefault === 'reject') {
      return hasPreviewValue(field.currentValue)
        ? field.currentValue
        : fallback;
    }
    if (hasPreviewValue(field.proposedValue)) return field.proposedValue;
    if (hasPreviewValue(field.currentValue)) return field.currentValue;
    return fallback;
  }
  function text(key: BrandKitFieldKey, fallback: string) {
    const result = value(key, fallback);
    return typeof result === 'string' && result.trim() ? result : fallback;
  }
  function readColor(
    key: BrandKitFieldKey,
    slot: BrandPreviewColor['key'],
    fallback: string | null | undefined,
  ): BrandPreviewColor | undefined {
    const result = text(key, fallback ?? '');
    return isPreviewHex(result) ? { key: slot, value: result } : undefined;
  }
  const label = text('label', fallbackBrand?.label ?? t('brand'));
  const logo = value('logo', {
    url: fallbackBrand?.logoUrl ?? fallbackBrand?.logo?.url,
  });
  const logoUrl =
    isRecord(logo) &&
    typeof logo.url === 'string' &&
    /^https?:\/\//u.test(logo.url)
      ? logo.url
      : undefined;
  const socialLinks = readPreviewSocialLinks(value('socialLinks', []));
  const colors = [
    readColor('primaryColor', 'primary', fallbackBrand?.primaryColor),
    readColor('secondaryColor', 'secondary', fallbackBrand?.secondaryColor),
    readColor('backgroundColor', 'background', fallbackBrand?.backgroundColor),
  ].filter((color): color is BrandPreviewColor => color !== undefined);
  const description = text(
    'description',
    fallbackBrand?.description || t('description'),
  );
  const sample = text(
    'voiceSampleOutput',
    fallbackBrand?.agentConfig?.voice?.sampleOutput || t('sample'),
  );
  const font = text('fontFamily', fallbackBrand?.fontFamily || 'inherit');
  const isApprovedUnavailable = source === 'approved' && !approvedContent;

  return (
    <section
      aria-label={t('label')}
      className="space-y-4"
      data-testid="brand-kit-local-preview"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-sm font-medium">
          {t('title', {
            source: source === 'approved' ? t('approved') : t('draft'),
          })}
        </span>
        <Tabs
          activeTab={source}
          onTabChange={setSource}
          ariaLabel={t('sourceLabel')}
          fullWidth={false}
          tabs={[
            {
              id: 'approved',
              label: t('approved'),
              isDisabled: !approvedContent,
            },
            { id: 'draft', label: t('draft') },
          ]}
        />
      </div>
      <Select
        value={template}
        onValueChange={(next) => {
          if (next === 'cover' || next === 'profile' || next === 'social') {
            setTemplate(next);
          }
        }}
      >
        <SelectTrigger aria-label={t('templateLabel')}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="social">{t('social')}</SelectItem>
          <SelectItem value="cover">{t('cover')}</SelectItem>
          <SelectItem value="profile">{t('profile')}</SelectItem>
        </SelectContent>
      </Select>
      {isApprovedUnavailable ? (
        <p className="text-sm text-muted-foreground">{t('noApproved')}</p>
      ) : (
        <BrandPreviewSurface
          colors={colors}
          description={description}
          fontFamily={font}
          label={label}
          logoUrl={logoUrl}
          sample={sample}
          slug={brand.slug}
          socialLinks={socialLinks}
          template={template}
        />
      )}
      <p className="text-xs text-muted-foreground">{t('creditFree')}</p>
    </section>
  );
}
