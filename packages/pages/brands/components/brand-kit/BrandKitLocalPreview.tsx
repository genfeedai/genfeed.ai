'use client';

import type { BrandKitFieldKey } from '@genfeedai/contracts/interfaces';
import { isRecord } from '@genfeedai/utils/data/extract.util';
import type { BrandKitLocalPreviewProps } from '@props/pages/brand-kit-workspace.props';
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

/** Pure browser rendering. Changing a preview never calls a generation service. */
export default function BrandKitLocalPreview({
  brand,
  content,
  approvedContent,
}: BrandKitLocalPreviewProps) {
  const t = useTranslations('pages.brandKitSettings.preview');
  const [source, setSource] = useState('draft');
  const [template, setTemplate] = useState('social');
  const draft = source === 'approved' ? approvedContent : content;
  function value(key: BrandKitFieldKey, fallback: unknown) {
    const field = draft?.fields[key];
    if (!field || field.applyActionDefault === 'reject') return fallback;
    return field.applyActionDefault === 'preserve'
      ? (field.currentValue ?? fallback)
      : (field.proposedValue ?? field.currentValue ?? fallback);
  }
  function text(key: BrandKitFieldKey, fallback: string) {
    const result = value(key, fallback);
    return typeof result === 'string' && result.trim() ? result : fallback;
  }
  function color(key: BrandKitFieldKey, fallback: string) {
    const result = text(key, fallback);
    return /^#[\da-f]{3,8}$/iu.test(result) &&
      [4, 5, 7, 9].includes(result.length)
      ? result
      : fallback;
  }
  const label = text('label', brand.label);
  const logo = value('logo', { url: brand.logoUrl ?? brand.logo?.url });
  const logoUrl =
    isRecord(logo) &&
    typeof logo.url === 'string' &&
    /^https?:\/\//u.test(logo.url)
      ? logo.url
      : undefined;
  const background = color(
    'backgroundColor',
    brand.backgroundColor || '#000000',
  );
  const secondary = color('secondaryColor', brand.secondaryColor || '#FFFFFF');
  const primary = color('primaryColor', brand.primaryColor || '#000000');
  const sample = text(
    'voiceSampleOutput',
    brand.agentConfig?.voice?.sampleOutput || t('sample'),
  );
  const font = text('fontFamily', brand.fontFamily || 'inherit');
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
      <Select value={template} onValueChange={setTemplate}>
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
        <div
          className={`relative flex overflow-hidden rounded-lg border border-border p-8 ${template === 'cover' ? 'aspect-video' : template === 'profile' ? 'min-h-64' : 'aspect-square'} flex-col justify-between`}
          style={{
            backgroundColor: background,
            color: secondary,
            fontFamily: /^MONTSERRAT_/u.test(font)
              ? 'Montserrat, sans-serif'
              : font,
            fontWeight: font.endsWith('_BLACK')
              ? 900
              : font.endsWith('_BOLD')
                ? 700
                : undefined,
          }}
        >
          <div
            className="pointer-events-none absolute inset-0 opacity-20"
            style={{
              background: `linear-gradient(135deg, transparent 45%, ${primary} 100%)`,
            }}
          />
          <div className="relative flex items-center gap-3">
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
              <span className="flex size-10 items-center justify-center rounded-md border border-current text-lg font-bold">
                {label.slice(0, 1)}
              </span>
            )}
            <span className="text-lg font-semibold">{label}</span>
          </div>
          <div className="relative space-y-4 py-8">
            <p
              className={
                template === 'profile'
                  ? 'text-2xl font-bold leading-tight'
                  : 'text-3xl font-bold leading-tight sm:text-4xl'
              }
            >
              {template === 'profile' ? label : sample}
            </p>
            <p className="text-sm leading-relaxed opacity-80">
              {text('description', brand.description || t('description'))}
            </p>
          </div>
          <p className="relative text-xs opacity-70">{brand.slug}</p>
        </div>
      )}
      <p className="text-xs text-muted-foreground">{t('creditFree')}</p>
    </section>
  );
}
