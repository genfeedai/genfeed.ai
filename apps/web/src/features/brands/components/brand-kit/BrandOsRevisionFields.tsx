'use client';

import {
  ButtonSize,
  ButtonVariant,
  FONT_FAMILY_METADATA,
  FontFamily,
} from '@genfeedai/contracts';
import type { IBrandKitAssetCandidate } from '@genfeedai/contracts/interfaces';
import { BRAND_KIT_FIELD_OWNERSHIP } from '@genfeedai/contracts/interfaces';
import { isRecord } from '@genfeedai/utils/data/extract.util';
import { Badge } from '@ui/primitives/badge';
import { Button } from '@ui/primitives/button';
import { Checkbox } from '@ui/primitives/checkbox';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@ui/primitives/collapsible';
import { ColorInput } from '@ui/primitives/color-input';
import { Input } from '@ui/primitives/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import { StatusDot } from '@ui/primitives/status-dot';
import { Textarea } from '@ui/primitives/textarea';
import { Undo2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRef, useState } from 'react';
import type {
  BrandOsRevisionFieldsProps,
  BrandOsValueEditorProps,
} from '@/features/brands/props/brand-os-settings.props';
import BrandFontRolesEditor from './BrandFontRolesEditor';
import BrandPaletteEditor from './BrandPaletteEditor';
import {
  isBrandKitHexColor,
  toColorPickerValue,
} from './brand-kit-color-value';

function ValueEditor({
  brandId,
  label,
  fieldKey,
  value,
  valueKind,
  assetRole,
  isDisabled,
  onChange,
}: BrandOsValueEditorProps) {
  const t = useTranslations('pages.brandOsSettings');
  const valueCount = Array.isArray(value) ? value.length : 0;
  const nextEntryKey = useRef(valueCount);
  const [entryKeys, setEntryKeys] = useState(() =>
    Array.from({ length: valueCount }, (_, slot) => String(slot)),
  );
  if (entryKeys.length !== valueCount) {
    setEntryKeys(
      Array.from({ length: valueCount }, () => String(nextEntryKey.current++)),
    );
  }
  if (valueKind === 'string[]') {
    const values = Array.isArray(value) ? value : [];
    return (
      <Textarea
        aria-label={label}
        disabled={isDisabled}
        maxLength={8000}
        value={values.join('\n')}
        onChange={(event) => onChange(event.target.value.split('\n'))}
      />
    );
  }
  if (valueKind === 'asset[]' || valueKind === 'socialLinks') {
    const values = Array.isArray(value) ? value : [];
    return (
      <div className="space-y-2">
        {values.map((entry, index) => (
          <div key={entryKeys[index]} className="space-y-2">
            <ValueEditor
              label={`${label} ${index + 1}`}
              value={entry}
              valueKind="asset"
              isDisabled={isDisabled}
              onChange={(next) =>
                onChange(
                  values.map((item, itemIndex) =>
                    itemIndex === index ? next : item,
                  ),
                )
              }
            />
            <Button
              label={t('removeEntry', { label, index: index + 1 })}
              isDisabled={isDisabled}
              onClick={() => {
                setEntryKeys((keys) =>
                  keys.filter((_, itemIndex) => itemIndex !== index),
                );
                onChange(values.filter((_, itemIndex) => itemIndex !== index));
              }}
            />
          </div>
        ))}
        <Button
          label={t('addEntry', { label })}
          isDisabled={isDisabled || values.length >= 50}
          onClick={() => {
            setEntryKeys((keys) => [...keys, String(nextEntryKey.current++)]);
            onChange([
              ...values,
              valueKind === 'socialLinks'
                ? { platform: '', url: '', sourceType: 'manual' }
                : {
                    role: assetRole ?? 'reference',
                    url: '',
                    sourceType: 'manual',
                  },
            ]);
          }}
        />
      </div>
    );
  }
  if (valueKind === 'asset') {
    const asset = isRecord(value)
      ? value
      : { role: assetRole, sourceType: 'manual', url: '' };
    const keys = ['label', 'url', ...('platform' in asset ? ['platform'] : [])];
    return (
      <div className="space-y-2">
        {keys.map((key) => (
          <Input
            key={key}
            aria-label={`${label} ${key}`}
            disabled={isDisabled}
            maxLength={8000}
            value={String(asset[key] ?? '')}
            onChange={(event) =>
              onChange({ ...asset, [key]: event.target.value })
            }
          />
        ))}
        {asset.id ? (
          <p className="text-xs text-muted-foreground">{String(asset.id)}</p>
        ) : null}
      </div>
    );
  }
  if (valueKind === 'palette' || valueKind === 'fontRoles') {
    const Editor =
      valueKind === 'palette' ? BrandPaletteEditor : BrandFontRolesEditor;
    return (
      <Editor
        brandId={brandId ?? ''}
        label={label}
        value={value}
        isDisabled={isDisabled}
        onChange={onChange}
      />
    );
  }
  if (fieldKey === 'fontFamily') {
    const current = String(value ?? '');
    return (
      <Select
        value={current || undefined}
        disabled={isDisabled}
        onValueChange={onChange}
      >
        <SelectTrigger aria-label={label}>
          <SelectValue placeholder={t('chooseFont')} />
        </SelectTrigger>
        <SelectContent>
          {current &&
            !Object.values(FontFamily).some((font) => font === current) && (
              <SelectItem value={current}>{current}</SelectItem>
            )}
          {Object.values(FontFamily).map((font) => (
            <SelectItem key={font} value={font}>
              {FONT_FAMILY_METADATA[font].label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }
  if (
    fieldKey &&
    ['primaryColor', 'secondaryColor', 'backgroundColor'].includes(fieldKey)
  ) {
    const color = String(value ?? '');
    if (!isBrandKitHexColor(color)) {
      return (
        <Input
          aria-label={label}
          disabled={isDisabled}
          maxLength={200}
          value={color}
          onChange={(event) => onChange(event.target.value)}
        />
      );
    }
    return (
      <ColorInput
        aria-label={label}
        disabled={isDisabled}
        value={toColorPickerValue(color)}
        onChange={(event) => onChange(event.target.value)}
      />
    );
  }
  if (fieldKey === 'label')
    return (
      <Input
        aria-label={label}
        disabled={isDisabled}
        maxLength={200}
        value={String(value ?? '')}
        onChange={(event) => onChange(event.target.value)}
      />
    );
  return (
    <Textarea
      rows={3}
      aria-label={label}
      disabled={isDisabled}
      maxLength={8000}
      value={String(value ?? '')}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

function hasRevisionDisplayValue(value: unknown): boolean {
  if (typeof value === 'string') {
    return value.trim().length > 0;
  }
  if (Array.isArray(value)) {
    return value.some(hasRevisionDisplayValue);
  }
  if (isRecord(value)) {
    if (typeof value.url === 'string' && value.url.trim().length > 0) {
      return true;
    }
    return Object.values(value).some(hasRevisionDisplayValue);
  }
  return false;
}

function summarizeRevisionValue(value: unknown): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(summarizeRevisionValue).join(', ');
  if (isRecord(value)) {
    const named = value.label ?? value.url ?? value.name;
    if (typeof named === 'string') return named;
    return Object.values(value).map(summarizeRevisionValue).join(' ');
  }
  return String(value ?? '');
}

function candidateValue(candidate: IBrandKitAssetCandidate) {
  const {
    candidateId: _candidateId,
    sourceUrl: _sourceUrl,
    diagnostics: _diagnostics,
    ...value
  } = candidate;
  return value;
}

export default function BrandOsRevisionFields({
  content,
  isDisabled,
  onFieldChange,
  groups,
  variant = 'decisions',
}: BrandOsRevisionFieldsProps) {
  const t = useTranslations('pages.brandOsSettings');
  return (
    <div className="space-y-4">
      {BRAND_KIT_FIELD_OWNERSHIP.filter(
        (field) => !groups || groups.includes(field.group),
      ).map(({ key, label, group, ownerPath, valueKind }) => {
        const field = content.fields[key] ?? {
          key,
          label,
          group,
          ownerPath,
          applyActionDefault: 'reject',
          evidence: [],
          diagnostics: [],
        };
        const value =
          variant === 'decisions'
            ? field.applyActionDefault === 'preserve'
              ? field.currentValue
              : (field.proposedValue ?? field.currentValue)
            : field.applyActionDefault === 'reject'
              ? field.currentValue
              : hasRevisionDisplayValue(field.proposedValue)
                ? field.proposedValue
                : field.currentValue;
        const role = key === 'references' ? 'reference' : key;
        const candidates = content.assetCandidates.filter(
          (candidate) => candidate.role === role,
        );
        const editor = (
          <>
            <ValueEditor
              brandId={content.brandId}
              label={label}
              fieldKey={key}
              value={value}
              valueKind={valueKind}
              assetRole={
                key === 'logo'
                  ? 'logo'
                  : key === 'banner'
                    ? 'banner'
                    : 'reference'
              }
              isDisabled={isDisabled}
              onChange={(next) =>
                onFieldChange(key, {
                  applyActionDefault: 'accept',
                  proposedValue: next,
                })
              }
            />
            {candidates.length > 0 && (
              <div
                role="group"
                className="space-y-2"
                aria-label={t('candidatesLabel', { label })}
              >
                <p className="text-xs text-muted-foreground">
                  {t('candidateHelp')}
                </p>
                {candidates.map((candidate) => {
                  const values = Array.isArray(value) ? value : [value];
                  const selected = values.some(
                    (entry) =>
                      isRecord(entry) &&
                      ((candidate.url && entry.url === candidate.url) ||
                        (candidate.id && entry.id === candidate.id)),
                  );
                  return (
                    <Checkbox
                      key={candidate.candidateId}
                      aria-label={t('useCandidate', {
                        label:
                          candidate.label ??
                          candidate.url ??
                          candidate.candidateId,
                      })}
                      label={
                        candidate.label ?? candidate.url ?? t('assetCandidate')
                      }
                      isDisabled={isDisabled}
                      isChecked={selected}
                      onCheckedChange={(checked) => {
                        const remaining = values.filter(
                          (entry) =>
                            isRecord(entry) &&
                            !(
                              (candidate.url && entry.url === candidate.url) ||
                              (candidate.id && entry.id === candidate.id)
                            ),
                        );
                        const currentValues = Array.isArray(field.currentValue)
                          ? field.currentValue
                          : [field.currentValue];
                        const restoreCurrent =
                          checked !== true &&
                          field.currentValue !== undefined &&
                          (remaining.length === 0 ||
                            JSON.stringify(remaining) ===
                              JSON.stringify(currentValues));
                        onFieldChange(key, {
                          applyActionDefault: restoreCurrent
                            ? 'preserve'
                            : checked === true
                              ? 'accept'
                              : remaining.length
                                ? 'accept'
                                : 'reject',
                          proposedValue: restoreCurrent
                            ? field.currentValue
                            : key === 'references'
                              ? checked === true
                                ? [...remaining, candidateValue(candidate)]
                                : remaining
                              : checked === true
                                ? candidateValue(candidate)
                                : undefined,
                        });
                      }}
                    />
                  );
                })}
              </div>
            )}
            {field.diagnostics.map((diagnostic) => (
              <p
                key={diagnostic.code}
                className="text-xs text-muted-foreground"
              >
                {diagnostic.message}
              </p>
            ))}
          </>
        );
        if (variant === 'inline') {
          const isChanged =
            field.applyActionDefault === 'accept' &&
            field.proposedValue !== undefined &&
            JSON.stringify(field.proposedValue) !==
              JSON.stringify(field.currentValue);
          const isSuggested =
            field.applyActionDefault === 'reject' &&
            hasRevisionDisplayValue(field.proposedValue) &&
            JSON.stringify(field.proposedValue) !==
              JSON.stringify(field.currentValue);
          return (
            <div
              key={key}
              className="grid gap-2 border-t border-border py-3 sm:grid-cols-[9rem_minmax(0,1fr)] sm:gap-4"
            >
              <div className="flex items-start gap-2 pt-1.5 text-sm text-muted-foreground">
                <span>{label}</span>
                {isChanged ? (
                  <>
                    <StatusDot
                      tone="info"
                      size="xs"
                      role="img"
                      aria-label={t('changed')}
                      className="mt-1.5"
                    />
                    <Button
                      variant={ButtonVariant.GHOST}
                      size={ButtonSize.ICON}
                      ariaLabel={t('revertField', { label })}
                      isDisabled={isDisabled}
                      icon={<Undo2 className="size-3.5" />}
                      onClick={() =>
                        onFieldChange(key, {
                          applyActionDefault: 'preserve',
                          proposedValue: field.currentValue,
                        })
                      }
                    />
                  </>
                ) : null}
              </div>
              <div className="min-w-0 space-y-2">
                {editor}
                {isSuggested ? (
                  <div className="flex items-center gap-2 rounded-md border border-border bg-tertiary py-1.5 pl-3 pr-1.5 text-xs text-muted-foreground">
                    <span className="min-w-0 flex-1 truncate">
                      {t('suggested', {
                        value: summarizeRevisionValue(field.proposedValue),
                      })}
                    </span>
                    <Button
                      variant={ButtonVariant.SECONDARY}
                      size={ButtonSize.XS}
                      isDisabled={isDisabled}
                      onClick={() =>
                        onFieldChange(key, { applyActionDefault: 'accept' })
                      }
                    >
                      {t('useSuggestion')}
                    </Button>
                  </div>
                ) : null}
              </div>
            </div>
          );
        }
        return (
          <Collapsible key={key}>
            <div className="flex items-center gap-3 border-t border-border">
              <CollapsibleTrigger className="min-w-0 flex-1 py-3 text-left hover:no-underline">
                <span className="truncate text-sm font-medium">{label}</span>
              </CollapsibleTrigger>
              {field.diagnostics.length > 0 ? (
                <Badge variant="warning">{t('verify')}</Badge>
              ) : null}
              <Checkbox
                aria-label={t('includeLabel', { label })}
                label={t('include')}
                isChecked={field.applyActionDefault !== 'reject'}
                isDisabled={isDisabled}
                onCheckedChange={(checked) =>
                  onFieldChange(key, {
                    applyActionDefault: checked === true ? 'accept' : 'reject',
                  })
                }
              />
            </div>
            <CollapsibleContent>
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">
                  {t(`groups.${group}`)}
                  {valueKind === 'string[]' ? ` · ${t('onePerLine')}` : ''}
                </p>
                {editor}
              </div>
            </CollapsibleContent>
          </Collapsible>
        );
      })}
    </div>
  );
}
