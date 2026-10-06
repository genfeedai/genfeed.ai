'use client';

import { FontFamily } from '@genfeedai/contracts';
import type { IBrandKitAssetCandidate } from '@genfeedai/contracts/interfaces';
import { BRAND_KIT_FIELD_OWNERSHIP } from '@genfeedai/contracts/interfaces';
import { isRecord } from '@genfeedai/utils/data/extract.util';
import type {
  BrandOsRevisionFieldsProps,
  BrandOsValueEditorProps,
} from '@props/pages/brand-os-settings.props';
import { Button } from '@ui/primitives/button';
import { Checkbox } from '@ui/primitives/checkbox';
import { Input } from '@ui/primitives/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import { Textarea } from '@ui/primitives/textarea';
import { useTranslations } from 'next-intl';
import { useRef, useState } from 'react';

function ValueEditor({
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
              {font
                .replace('MONTSERRAT_', 'Montserrat ')
                .toLowerCase()
                .replace(/^m/u, 'M')}
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
    return (
      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className="size-8 shrink-0 rounded border border-border"
          style={{
            backgroundColor: /^#[\da-f]{3,8}$/iu.test(color)
              ? color
              : 'transparent',
          }}
        />
        <Input
          aria-label={label}
          disabled={isDisabled}
          maxLength={32}
          value={color}
          onChange={(event) => onChange(event.target.value)}
        />
      </div>
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
  showDecisions = true,
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
        const value = showDecisions
          ? field.applyActionDefault === 'preserve'
            ? field.currentValue
            : (field.proposedValue ?? field.currentValue)
          : field.applyActionDefault === 'accept'
            ? (field.proposedValue ?? field.currentValue)
            : field.currentValue;
        const role = key === 'references' ? 'reference' : key;
        const candidates = content.assetCandidates.filter(
          (candidate) => candidate.role === role,
        );
        return (
          <div key={key} className="space-y-2 border-t border-border pt-3">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-medium">{label}</span>
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
            <p className="text-xs text-muted-foreground">
              {t(`groups.${group}`)}
              {valueKind === 'string[]' ? ` · ${t('onePerLine')}` : ''}
            </p>
            <ValueEditor
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
          </div>
        );
      })}
    </div>
  );
}
