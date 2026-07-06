'use client';

import { ButtonVariant } from '@genfeedai/enums';
import type {
  BrandKitFieldKey,
  IBrandKitDraft,
  IBrandKitManualInput,
} from '@genfeedai/interfaces';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import type { BrandDetailManualKitCardProps } from '@props/pages/brand-detail.props';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { BrandsService } from '@services/social/brands.service';
import Card from '@ui/card/Card';
import { Button } from '@ui/primitives/button';
import { Checkbox } from '@ui/primitives/checkbox';
import { Input } from '@ui/primitives/input';
import { Textarea } from '@ui/primitives/textarea';
import { type ChangeEvent, useCallback, useMemo, useState } from 'react';
import { HiArrowUpTray, HiCheckCircle, HiDocumentText } from 'react-icons/hi2';

type ManualKitFormState = {
  backgroundColor: string;
  description: string;
  fontFamily: string;
  guidanceDocumentName: string;
  guidanceText: string;
  primaryColor: string;
  secondaryColor: string;
  voiceStyle: string;
  voiceTone: string;
};

type ManualApplyFieldKey = Extract<
  BrandKitFieldKey,
  | 'backgroundColor'
  | 'description'
  | 'fontFamily'
  | 'primaryColor'
  | 'promptGuidelines'
  | 'secondaryColor'
  | 'voiceStyle'
  | 'voiceTone'
>;

type ManualApplyFieldConfig = {
  key: ManualApplyFieldKey;
  label: string;
};

const GUIDANCE_EXTENSIONS = ['.csv', '.json', '.md', '.markdown', '.txt'];

const APPLY_FIELD_CONFIGS: ManualApplyFieldConfig[] = [
  { key: 'description', label: 'Description' },
  { key: 'primaryColor', label: 'Primary color' },
  { key: 'secondaryColor', label: 'Secondary color' },
  { key: 'backgroundColor', label: 'Background color' },
  { key: 'fontFamily', label: 'Font' },
  { key: 'promptGuidelines', label: 'Brand guidance' },
  { key: 'voiceTone', label: 'Voice tone' },
  { key: 'voiceStyle', label: 'Voice style' },
];

function toFormState(
  brand: BrandDetailManualKitCardProps['brand'],
): ManualKitFormState {
  return {
    backgroundColor: brand.backgroundColor ?? '',
    description: brand.description ?? '',
    fontFamily: brand.fontFamily ?? '',
    guidanceDocumentName: '',
    guidanceText: brand.text ?? '',
    primaryColor: brand.primaryColor ?? '',
    secondaryColor: brand.secondaryColor ?? '',
    voiceStyle: brand.agentConfig?.voice?.style ?? '',
    voiceTone: brand.agentConfig?.voice?.tone ?? '',
  };
}

function hasText(value: string): boolean {
  return value.trim().length > 0;
}

function optionalText(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function hasManualFieldInput(form: ManualKitFormState): boolean {
  return [
    form.backgroundColor,
    form.description,
    form.fontFamily,
    form.guidanceText,
    form.primaryColor,
    form.secondaryColor,
    form.voiceStyle,
    form.voiceTone,
  ].some(hasText);
}

function isSupportedGuidanceFile(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  return GUIDANCE_EXTENSIONS.some((extension) => lower.endsWith(extension));
}

function formatProposedValue(value: unknown): string {
  if (Array.isArray(value)) {
    return value.join(', ');
  }

  if (typeof value === 'string') {
    return value.length > 160 ? `${value.slice(0, 157)}...` : value;
  }

  if (value && typeof value === 'object') {
    return 'Asset selection';
  }

  return String(value ?? '');
}

function readProposedFieldKeys(draft: IBrandKitDraft): ManualApplyFieldKey[] {
  return APPLY_FIELD_CONFIGS.filter(
    ({ key }) => draft.fields[key]?.proposedValue !== undefined,
  ).map(({ key }) => key);
}

function createManualInput(
  brand: BrandDetailManualKitCardProps['brand'],
  form: ManualKitFormState,
): IBrandKitManualInput {
  const assets: NonNullable<IBrandKitManualInput['assets']> = [];

  if (brand.logo?.id || brand.logoUrl) {
    assets.push({
      id: brand.logo?.id,
      label: 'Current logo',
      role: 'logo',
      url: brand.logoUrl,
    });
  }

  if (brand.banner?.id || brand.bannerUrl) {
    assets.push({
      id: brand.banner?.id,
      label: 'Current banner',
      role: 'banner',
      url: brand.bannerUrl,
    });
  }

  for (const [index, reference] of (brand.references ?? []).entries()) {
    assets.push({
      id: reference.id,
      label: `Reference ${index + 1}`,
      role: 'reference',
    });
  }

  return {
    assets,
    backgroundColor: optionalText(form.backgroundColor),
    description: optionalText(form.description),
    fontFamily: optionalText(form.fontFamily),
    guidanceDocumentName: optionalText(form.guidanceDocumentName),
    guidanceText: optionalText(form.guidanceText),
    primaryColor: optionalText(form.primaryColor),
    secondaryColor: optionalText(form.secondaryColor),
    voiceStyle: optionalText(form.voiceStyle),
    voiceTone: optionalText(form.voiceTone),
  };
}

export default function BrandDetailManualKitCard({
  brand,
  brandId,
  onRefreshBrand,
  onUploadBanner,
  onUploadLogo,
  onUploadReference,
}: BrandDetailManualKitCardProps) {
  const notifications = NotificationsService.getInstance();
  const [form, setForm] = useState<ManualKitFormState>(() =>
    toFormState(brand),
  );
  const [draft, setDraft] = useState<IBrandKitDraft | null>(null);
  const [selectedFields, setSelectedFields] = useState<ManualApplyFieldKey[]>(
    [],
  );
  const [error, setError] = useState<string | null>(null);
  const [isDrafting, setIsDrafting] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [renderedBrandId, setRenderedBrandId] = useState(brandId);

  const getBrandsService = useAuthedService((token: string) =>
    BrandsService.getInstance(token),
  );

  if (brandId !== renderedBrandId) {
    setRenderedBrandId(brandId);
    setForm(toFormState(brand));
    setDraft(null);
    setSelectedFields([]);
    setError(null);
  }

  const attachedAssetCount = useMemo(
    () =>
      Number(Boolean(brand.logo || brand.logoUrl)) +
      Number(Boolean(brand.banner || brand.bannerUrl)) +
      (brand.references?.length ?? 0),
    [
      brand.banner,
      brand.bannerUrl,
      brand.logo,
      brand.logoUrl,
      brand.references,
    ],
  );

  const handleFieldChange = useCallback(
    (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>): void => {
      const { name, value } = event.target;
      setForm((current) => ({ ...current, [name]: value }));
    },
    [],
  );

  const handleGuidanceFileChange = useCallback(
    async (event: ChangeEvent<HTMLInputElement>): Promise<void> => {
      const file = event.target.files?.[0];
      if (!file) {
        return;
      }

      if (!isSupportedGuidanceFile(file.name)) {
        setError('Unsupported guidance file type.');
        event.target.value = '';
        return;
      }

      try {
        const text = await file.text();
        setForm((current) => ({
          ...current,
          guidanceDocumentName: file.name,
          guidanceText: text.slice(0, 12_000),
        }));
        setError(null);
      } catch (fileError) {
        logger.error('Failed to read manual brand guidance file', fileError);
        setError('Failed to read guidance file.');
      } finally {
        event.target.value = '';
      }
    },
    [],
  );

  const handleCreateDraft = useCallback(async (): Promise<void> => {
    const hasManualText = hasManualFieldInput(form);
    if (!hasManualText && attachedAssetCount === 0) {
      setError('Add at least one manual field, guidance source, or asset.');
      return;
    }

    setIsDrafting(true);
    setError(null);

    try {
      const service = await getBrandsService();
      const nextDraft = await service.createManualBrandKitDraft(
        brandId,
        createManualInput(brand, form),
      );
      const proposedKeys = readProposedFieldKeys(nextDraft);
      setDraft(nextDraft);
      setSelectedFields(proposedKeys);
      notifications.success('Manual brand kit draft ready');
    } catch (draftError) {
      logger.error('Failed to create manual brand kit draft', draftError);
      setError('Failed to create manual brand kit draft.');
      notifications.error('Failed to create manual brand kit draft');
    } finally {
      setIsDrafting(false);
    }
  }, [
    attachedAssetCount,
    brand,
    brandId,
    form,
    getBrandsService,
    notifications,
  ]);

  const toggleSelectedField = useCallback((key: ManualApplyFieldKey): void => {
    setSelectedFields((current) =>
      current.includes(key)
        ? current.filter((selectedKey) => selectedKey !== key)
        : [...current, key],
    );
  }, []);

  const handleApplyDraft = useCallback(async (): Promise<void> => {
    if (!draft || selectedFields.length === 0) {
      return;
    }

    const brandPatch: Record<string, unknown> = {};
    const voicePatch = { ...(brand.agentConfig?.voice ?? {}) };
    let hasVoicePatch = false;

    for (const fieldKey of selectedFields) {
      const value = draft.fields[fieldKey]?.proposedValue;
      if (value === undefined) {
        continue;
      }

      switch (fieldKey) {
        case 'description':
          brandPatch.description = value;
          break;
        case 'primaryColor':
          brandPatch.primaryColor = value;
          break;
        case 'secondaryColor':
          brandPatch.secondaryColor = value;
          break;
        case 'backgroundColor':
          brandPatch.backgroundColor = value;
          break;
        case 'fontFamily':
          brandPatch.fontFamily = value;
          break;
        case 'promptGuidelines':
          brandPatch.text = value;
          break;
        case 'voiceTone':
          voicePatch.tone = value as string;
          hasVoicePatch = true;
          break;
        case 'voiceStyle':
          voicePatch.style = value as string;
          hasVoicePatch = true;
          break;
      }
    }

    setIsApplying(true);
    setError(null);

    try {
      const service = await getBrandsService();
      if (Object.keys(brandPatch).length > 0) {
        await service.patch(brandId, brandPatch);
      }
      if (hasVoicePatch) {
        await service.updateAgentConfig(brandId, {
          voice: voicePatch,
        });
      }
      await onRefreshBrand();
      notifications.success('Manual brand kit fields applied');
    } catch (applyError) {
      logger.error('Failed to apply manual brand kit draft', applyError);
      setError('Failed to apply selected draft fields.');
      notifications.error('Failed to apply selected draft fields');
    } finally {
      setIsApplying(false);
    }
  }, [
    brand.agentConfig?.voice,
    brandId,
    draft,
    getBrandsService,
    notifications,
    onRefreshBrand,
    selectedFields,
  ]);

  return (
    <Card className="p-6" data-testid="brand-manual-kit-card">
      <div className="space-y-5">
        <div>
          <h2 className="text-lg font-semibold">Manual Brand Kit</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Draft brand kit fields from uploaded assets, typed values, and
            pasted guidance.
          </p>
        </div>

        <div className="space-y-3">
          <Textarea
            aria-label="Manual brand description"
            className="min-h-[88px]"
            name="description"
            placeholder="Description"
            value={form.description}
            onChange={handleFieldChange}
          />

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Input
              aria-label="Manual primary color"
              name="primaryColor"
              placeholder="Primary color"
              value={form.primaryColor}
              onChange={handleFieldChange}
            />
            <Input
              aria-label="Manual secondary color"
              name="secondaryColor"
              placeholder="Secondary color"
              value={form.secondaryColor}
              onChange={handleFieldChange}
            />
            <Input
              aria-label="Manual background color"
              name="backgroundColor"
              placeholder="Background color"
              value={form.backgroundColor}
              onChange={handleFieldChange}
            />
            <Input
              aria-label="Manual font family"
              name="fontFamily"
              placeholder="Font"
              value={form.fontFamily}
              onChange={handleFieldChange}
            />
            <Input
              aria-label="Manual voice tone"
              name="voiceTone"
              placeholder="Voice tone"
              value={form.voiceTone}
              onChange={handleFieldChange}
            />
            <Input
              aria-label="Manual voice style"
              name="voiceStyle"
              placeholder="Voice style"
              value={form.voiceStyle}
              onChange={handleFieldChange}
            />
          </div>

          <Textarea
            aria-label="Manual brand guidance"
            className="min-h-[120px]"
            name="guidanceText"
            placeholder="Brand guidance"
            value={form.guidanceText}
            onChange={handleFieldChange}
          />

          <label className="flex cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed border-border px-3 py-2 text-sm text-muted-foreground hover:border-foreground/30">
            <HiDocumentText className="size-4" />
            <span>{form.guidanceDocumentName || 'Upload guidance file'}</span>
            <Input
              aria-label="Upload guidance file"
              className="sr-only"
              type="file"
              accept=".txt,.md,.markdown,.json,.csv,text/plain,text/markdown,application/json,text/csv"
              onChange={(event) => {
                void handleGuidanceFileChange(event);
              }}
            />
          </label>
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <Button
            className="w-full gap-2"
            icon={<HiArrowUpTray />}
            label={brand.logo || brand.logoUrl ? 'Replace Logo' : 'Upload Logo'}
            variant={ButtonVariant.SECONDARY}
            wrapperClassName="w-full"
            onClick={onUploadLogo}
          />
          <Button
            className="w-full gap-2"
            icon={<HiArrowUpTray />}
            label={
              brand.banner || brand.bannerUrl
                ? 'Replace Banner'
                : 'Upload Banner'
            }
            variant={ButtonVariant.SECONDARY}
            wrapperClassName="w-full"
            onClick={onUploadBanner}
          />
          <Button
            className="w-full gap-2"
            icon={<HiArrowUpTray />}
            label="Upload Reference"
            variant={ButtonVariant.SECONDARY}
            wrapperClassName="w-full"
            onClick={onUploadReference}
          />
        </div>

        <div className="rounded-md bg-background-secondary p-3 text-sm shadow-border">
          <div className="flex items-center justify-between gap-3">
            <span className="font-medium">Attached assets</span>
            <span className="text-muted-foreground">{attachedAssetCount}</span>
          </div>
          <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
            {brand.logo || brand.logoUrl ? <span>Logo</span> : null}
            {brand.banner || brand.bannerUrl ? <span>Banner</span> : null}
            {(brand.references ?? []).length > 0 ? (
              <span>{brand.references?.length} references</span>
            ) : null}
            {attachedAssetCount === 0 ? <span>No assets attached</span> : null}
          </div>
        </div>

        {error ? (
          <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        ) : null}

        <Button
          className="w-full"
          icon={<HiDocumentText />}
          isDisabled={isDrafting || isApplying}
          isLoading={isDrafting}
          label="Create Manual Draft"
          wrapperClassName="w-full"
          onClick={() => {
            void handleCreateDraft();
          }}
        />

        {draft ? (
          <div
            className="space-y-3 rounded-md bg-background-secondary p-3 shadow-border"
            data-testid="manual-kit-draft-review"
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold">Draft Review</h3>
                <p className="text-xs text-muted-foreground">
                  {draft.readiness.status} - {draft.readiness.score}%
                </p>
              </div>
              <span className="rounded-full bg-muted px-2 py-1 text-xs text-muted-foreground">
                {draft.sourceType}
              </span>
            </div>

            <div className="space-y-2">
              {APPLY_FIELD_CONFIGS.map(({ key, label }) => {
                const proposedValue = draft.fields[key]?.proposedValue;
                if (proposedValue === undefined) {
                  return null;
                }

                return (
                  <label
                    key={key}
                    className="flex items-start gap-2 rounded-md bg-background-secondary p-2 text-sm shadow-border"
                  >
                    <Checkbox
                      aria-label={`Select ${label}`}
                      className="mt-1"
                      isChecked={selectedFields.includes(key)}
                      onCheckedChange={() => toggleSelectedField(key)}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium">{label}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {formatProposedValue(proposedValue)}
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>

            {draft.assetCandidates.length > 0 ? (
              <div className="flex items-center gap-2 rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
                <HiCheckCircle className="size-4" />
                {draft.assetCandidates.length} asset source
                {draft.assetCandidates.length === 1 ? '' : 's'} included
              </div>
            ) : null}

            {draft.diagnostics.length > 0 ? (
              <div className="space-y-1 text-xs text-muted-foreground">
                {draft.diagnostics.map((diagnostic) => (
                  <p key={`${diagnostic.code}:${diagnostic.fieldKey ?? ''}`}>
                    {diagnostic.message}
                  </p>
                ))}
              </div>
            ) : null}

            <Button
              className="w-full"
              icon={<HiCheckCircle />}
              isDisabled={selectedFields.length === 0 || isApplying}
              isLoading={isApplying}
              label="Apply Selected"
              wrapperClassName="w-full"
              onClick={() => {
                void handleApplyDraft();
              }}
            />
          </div>
        ) : null}
      </div>
    </Card>
  );
}
