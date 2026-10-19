'use client';

import { LinkCategory, ModalEnum } from '@genfeedai/contracts';
import {
  BRAND_HANDLE_FORMAT_MESSAGE,
  BRAND_HANDLE_MAX_LENGTH,
  createBrandAppRoute,
  isValidBrandHandle,
} from '@genfeedai/contracts/constants';
import type { IBrand } from '@genfeedai/contracts/interfaces';
import { closeModal } from '@genfeedai/helpers/ui/modal/modal.helper';
import { useAuthedService } from '@genfeedai/hooks/auth/use-authed-service/use-authed-service';
import { useOrgUrl } from '@genfeedai/hooks/navigation/use-org-url';
import { useModalAutoOpen } from '@genfeedai/hooks/ui/use-modal-auto-open/use-modal-auto-open';
import { useFormSubmitWithState } from '@genfeedai/hooks/utils/use-form-submit/use-form-submit';
import { Brand } from '@genfeedai/models/organization/brand.model';
import type { ModalBrandCreateProps } from '@genfeedai/props/modals/modal.props';
import { logger } from '@genfeedai/services/core/logger.service';
import { NotificationsService } from '@genfeedai/services/core/notifications.service';
import { BrandsService } from '@genfeedai/services/social/brands.service';
import { LinksService } from '@genfeedai/services/social/links.service';
import { hasErrorDetail } from '@genfeedai/utils/error/error-handler.util';
import { THEME_COLORS } from '@ui-constants/theme.constant';
import { useRouter } from 'next/navigation';
import {
  type ChangeEvent,
  type FormEvent,
  useCallback,
  useMemo,
  useState,
} from 'react';
import { useForm } from 'react-hook-form';
import type { BrandFormValues } from './ModalBrand.types';

const DEFAULT_BRAND_FORM_VALUES: BrandFormValues = {
  backgroundColor: THEME_COLORS.PRIMARY,
  defaultImageModel: '',
  defaultImageToVideoModel: '',
  defaultMusicModel: '',
  defaultVideoModel: '',
  description: '',
  fontFamily: 'montserrat-regular',
  label: '',
  organizationId: '',
  primaryColor: THEME_COLORS.PRIMARY,
  secondaryColor: THEME_COLORS.SECONDARY,
  slug: '',
  text: '',
  websiteUrl: '',
};

export function slugifyBrandLabel(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .slice(0, BRAND_HANDLE_MAX_LENGTH)
    .replace(/^-+|-+$/g, '');
}

export function normalizeWebsiteUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  return `https://${trimmed}`;
}

function isHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(normalizeWebsiteUrl(value));
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export type UseModalBrandCreateReturn = {
  canLoadFromWebsite: boolean;
  canSubmit: boolean;
  error: string | null;
  form: ReturnType<typeof useForm<BrandFormValues>>;
  isLoadingWebsite: boolean;
  isSubmitting: boolean;
  websiteLoadError: string | null;
  closeModalBrandCreate: () => void;
  loadFromWebsite: () => Promise<void>;
  onChange: (
    event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>;
};

/** Create-only brand form: identity fields, website prefill and submit. */
export function useModalBrandCreate(
  props: Pick<
    ModalBrandCreateProps,
    'isOpen' | 'onClose' | 'onConfirm' | 'openKey'
  >,
): UseModalBrandCreateReturn {
  const { isOpen, onClose, onConfirm, openKey } = props;
  const { push } = useRouter();
  const { orgSlug } = useOrgUrl();
  const notifications = useMemo(() => NotificationsService.getInstance(), []);

  useModalAutoOpen(ModalEnum.BRAND, { isOpen, openKey });

  const getBrandsService = useAuthedService((token: string) =>
    BrandsService.getInstance(token),
  );
  const getLinksService = useAuthedService((token: string) =>
    LinksService.getInstance(token),
  );

  const [error, setError] = useState<string | null>(null);
  const [isSlugDirty, setIsSlugDirty] = useState(false);
  const [isLoadingWebsite, setIsLoadingWebsite] = useState(false);
  const [websiteLoadError, setWebsiteLoadError] = useState<string | null>(null);

  const form = useForm<BrandFormValues>({
    defaultValues: DEFAULT_BRAND_FORM_VALUES,
    mode: 'onChange',
  });

  const onChange = useCallback(
    (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const { name, value } = event.target;
      form.setValue(name as keyof BrandFormValues, value, {
        shouldValidate: true,
      });

      if (name === 'slug') {
        setIsSlugDirty(true);
        return;
      }

      if (name === 'label' && !isSlugDirty) {
        form.setValue('slug', slugifyBrandLabel(value), {
          shouldDirty: true,
          shouldValidate: true,
        });
      }
    },
    [form, isSlugDirty],
  );

  const watchedLabel = form.watch('label');
  const watchedSlug = form.watch('slug');
  const watchedWebsite = form.watch('websiteUrl');

  const canSubmit = (() => {
    const label = (watchedLabel ?? '').trim();
    const slug = (watchedSlug ?? '').trim();
    if (!label || !slug || !isValidBrandHandle(slug)) {
      return false;
    }
    const website = (watchedWebsite ?? '').trim();
    // Require an absolute http(s) URL when one is provided.
    return !website || isHttpUrl(website);
  })();

  const closeModalBrandCreate = useCallback(() => {
    setError(null);
    setWebsiteLoadError(null);
    onClose?.();
  }, [onClose]);

  const submitBrand = useCallback(async () => {
    try {
      const service = await getBrandsService();
      const { websiteUrl = '', ...brandFormValues } = form.getValues();
      const label = brandFormValues.label?.trim() ?? '';
      const slug = brandFormValues.slug?.trim() ?? '';

      // Never hit the API with empty required identity fields.
      if (!label || !slug) {
        setError('Label and slug are required.');
        return;
      }

      if (!isValidBrandHandle(slug)) {
        setError(BRAND_HANDLE_FORMAT_MESSAGE);
        return;
      }

      const createdBrand = await service.post(
        new Brand({
          ...brandFormValues,
          isDeleted: false,
          label,
          slug,
        } as Partial<IBrand>),
      );

      if (websiteUrl.trim()) {
        try {
          const normalizedWebsiteUrl = websiteUrl.trim();
          const linksService = await getLinksService();
          await linksService.post({
            brandId: createdBrand.id,
            category: LinkCategory.WEBSITE,
            label: 'Website',
            url: normalizedWebsiteUrl,
          });

          const draft = await service.crawlBrandKitWebsite(createdBrand.id, {
            url: normalizedWebsiteUrl,
          });
          const assetsToImport = draft.assetCandidates
            .filter(
              (candidate) =>
                candidate.role === 'banner' || candidate.role === 'logo',
            )
            .map((candidate) => ({
              candidateId: candidate.candidateId,
              label: candidate.label,
              mimeType: candidate.mimeType,
              replaceExisting: false,
              role: candidate.role,
              sourceType: 'website' as const,
              sourceUrl: candidate.sourceUrl ?? candidate.url,
            }));

          if (assetsToImport.length > 0) {
            await service.importBrandKitAssets(createdBrand.id, {
              assets: assetsToImport,
            });
          }
        } catch (enrichmentError) {
          logger.error(
            'Brand created but website enrichment failed',
            enrichmentError,
          );
        }
      }

      const createdBrandDetail = await service.findOne(createdBrand.id);
      const createdBrandSlug = createdBrandDetail.slug || createdBrand.slug;

      // The confirm handler selects the new brand and refreshes the switcher,
      // so await it before navigating to avoid a stale brand list.
      await onConfirm(createdBrand.id);
      onClose?.();
      closeModal(ModalEnum.BRAND);

      if (createdBrandSlug) {
        push(createBrandAppRoute(orgSlug, createdBrandSlug, '/settings'));
      }
    } catch (submitError) {
      logger.error('Failed to create brand', submitError);

      if (hasErrorDetail(submitError, 'brand limit')) {
        setError(
          'Credits have been deducted for an additional brand. Please try creating the brand again.',
        );
        return;
      }

      setError('Failed to save brand');
    }
  }, [
    form,
    getBrandsService,
    getLinksService,
    onClose,
    onConfirm,
    orgSlug,
    push,
  ]);

  const { isSubmitting, onSubmit } = useFormSubmitWithState(() =>
    submitBrand(),
  );

  const canLoadFromWebsite =
    Boolean((watchedWebsite ?? '').trim()) &&
    isHttpUrl(watchedWebsite ?? '') &&
    !isSubmitting &&
    !isLoadingWebsite;

  const loadFromWebsite = useCallback(async () => {
    const websiteUrl = normalizeWebsiteUrl(form.getValues('websiteUrl') ?? '');
    if (!websiteUrl) {
      setWebsiteLoadError('Enter a website URL first');
      return;
    }

    try {
      setIsLoadingWebsite(true);
      setWebsiteLoadError(null);
      form.setValue('websiteUrl', websiteUrl, {
        shouldDirty: true,
        shouldValidate: true,
      });

      const service = await getBrandsService();
      const preview = await service.previewWebsite(websiteUrl);

      if (preview.websiteUrl || preview.sourceUrl) {
        form.setValue(
          'websiteUrl',
          preview.websiteUrl || preview.sourceUrl || websiteUrl,
          { shouldDirty: true, shouldValidate: true },
        );
      }
      if (preview.label) {
        form.setValue('label', preview.label, {
          shouldDirty: true,
          shouldValidate: true,
        });
        if (!isSlugDirty) {
          form.setValue(
            'slug',
            preview.slug || slugifyBrandLabel(preview.label),
            { shouldDirty: true, shouldValidate: true },
          );
        }
      } else if (preview.slug && !isSlugDirty) {
        form.setValue('slug', preview.slug, {
          shouldDirty: true,
          shouldValidate: true,
        });
      }
      if (preview.description) {
        form.setValue('description', preview.description, {
          shouldDirty: true,
          shouldValidate: true,
        });
      }
      if (preview.primaryColor) {
        form.setValue('primaryColor', preview.primaryColor, {
          shouldDirty: true,
        });
      }
      if (preview.secondaryColor) {
        form.setValue('secondaryColor', preview.secondaryColor, {
          shouldDirty: true,
        });
      }

      if (!preview.label && !preview.description) {
        notifications.error(
          'Website loaded but no brand name/description was found — fill fields manually',
        );
      } else {
        notifications.success(
          preview.logoUrl
            ? 'Brand details loaded — create the brand, then add the logo from Brand Kit'
            : 'Brand details loaded from website',
        );
      }
    } catch (loadError) {
      logger.error('Failed to load brand from website', loadError);
      const message =
        loadError instanceof Error && loadError.message
          ? loadError.message
          : 'Could not load brand data from that website';
      setWebsiteLoadError(message);
      notifications.error(message);
    } finally {
      setIsLoadingWebsite(false);
    }
  }, [form, getBrandsService, isSlugDirty, notifications]);

  return {
    canLoadFromWebsite,
    canSubmit,
    closeModalBrandCreate,
    error,
    form,
    isLoadingWebsite,
    isSubmitting,
    loadFromWebsite,
    onChange,
    onSubmit,
    websiteLoadError,
  };
}
