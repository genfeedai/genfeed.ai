'use client';

import type { IBrandKitAssetCandidate } from '@genfeedai/contracts/interfaces';
import { BRAND_KIT_FIELD_OWNERSHIP } from '@genfeedai/contracts/interfaces';
import type {
  BrandOsRevisionFieldsProps,
  BrandOsValueEditorProps,
} from '@props/pages/brand-os-settings.props';
import { Button } from '@ui/primitives/button';
import { Checkbox } from '@ui/primitives/checkbox';
import { Input } from '@ui/primitives/input';
import { Textarea } from '@ui/primitives/textarea';
import { useTranslations } from 'next-intl';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function ValueEditor({
  label,
  value,
  valueKind,
  assetRole,
  isDisabled,
  onChange,
}: BrandOsValueEditorProps) {
  const t = useTranslations('pages.brandOsSettings');
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
          <div key={`${label}-${index}`} className="space-y-2">
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
              onClick={() =>
                onChange(values.filter((_, itemIndex) => itemIndex !== index))
              }
            />
          </div>
        ))}
        <Button
          label={t('addEntry', { label })}
          isDisabled={isDisabled || values.length >= 50}
          onClick={() =>
            onChange([
              ...values,
              valueKind === 'socialLinks'
                ? { platform: '', url: '', sourceType: 'manual' }
                : {
                    role: assetRole ?? 'reference',
                    url: '',
                    sourceType: 'manual',
                  },
            ])
          }
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
  return (
    <Textarea
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
}: BrandOsRevisionFieldsProps) {
  const t = useTranslations('pages.brandOsSettings');
  return (
    <div className="space-y-4">
      {BRAND_KIT_FIELD_OWNERSHIP.map(
        ({ key, label, group, ownerPath, valueKind }) => {
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
            field.applyActionDefault === 'preserve'
              ? field.currentValue
              : (field.proposedValue ?? field.currentValue);
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
                      applyActionDefault:
                        checked === true ? 'accept' : 'reject',
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
                          candidate.label ??
                          candidate.url ??
                          t('assetCandidate')
                        }
                        isDisabled={isDisabled}
                        isChecked={selected}
                        onCheckedChange={(checked) => {
                          const remaining = values.filter(
                            (entry) =>
                              isRecord(entry) &&
                              !(
                                (candidate.url &&
                                  entry.url === candidate.url) ||
                                (candidate.id && entry.id === candidate.id)
                              ),
                          );
                          onFieldChange(key, {
                            applyActionDefault:
                              checked === true
                                ? 'accept'
                                : remaining.length
                                  ? 'accept'
                                  : 'reject',
                            proposedValue:
                              key === 'references'
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
        },
      )}
    </div>
  );
}
