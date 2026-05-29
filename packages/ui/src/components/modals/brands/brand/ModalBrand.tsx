'use client';

import { MODEL_KEYS } from '@genfeedai/constants';
import {
  useConfirmModal,
  useUploadModal,
} from '@genfeedai/contexts/providers/global-modals/global-modals.provider';
import { useBrand } from '@genfeedai/contexts/user/brand-context/brand-context';
import {
  AssetCategory,
  AssetScope,
  ButtonSize,
  ButtonVariant,
  LinkCategory,
  ModalEnum,
  PromptCategory,
  SystemPromptKey,
} from '@genfeedai/enums';
import {
  closeModal,
  openModal,
} from '@genfeedai/helpers/ui/modal/modal.helper';
import { useAuthedService } from '@genfeedai/hooks/auth/use-authed-service/use-authed-service';
import { useElements } from '@genfeedai/hooks/data/elements/use-elements/use-elements';
import { useOrganization } from '@genfeedai/hooks/data/organization/use-organization/use-organization';
import { useOrgUrl } from '@genfeedai/hooks/navigation/use-org-url';
import { useModalAutoOpen } from '@genfeedai/hooks/ui/use-modal-auto-open/use-modal-auto-open';
import { useFormSubmitWithState } from '@genfeedai/hooks/utils/use-form-submit/use-form-submit';
import { useSocketManager } from '@genfeedai/hooks/utils/use-socket-manager/use-socket-manager';
import type { IBrand, ILink } from '@genfeedai/interfaces';
import { Prompt } from '@genfeedai/models/content/prompt.model';
import { Brand } from '@genfeedai/models/organization/brand.model';
import type { Link } from '@genfeedai/models/social/link.model';
import type { BrandOverlayProps } from '@genfeedai/props/modals/modal.props';
import { AssetsService } from '@genfeedai/services/content/assets.service';
import { PromptsService } from '@genfeedai/services/content/prompts.service';
import { ClipboardService } from '@genfeedai/services/core/clipboard.service';
import { logger } from '@genfeedai/services/core/logger.service';
import { createPromptHandler } from '@genfeedai/services/core/socket-manager.service';
import { BrandsService } from '@genfeedai/services/social/brands.service';
import { LinksService } from '@genfeedai/services/social/links.service';
import { hasErrorDetail } from '@genfeedai/utils/error/error-handler.util';
import { WebSocketPaths } from '@genfeedai/utils/network/websocket.util';
import type { BrandLinkEditorValues } from '@pages/brands/components/sidebar/BrandDetailLinkEditor';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { LazyModalBrandGenerate } from '@ui/lazy/modal/LazyModal';
import EntityOverlayShell from '@ui/overlays/entity/EntityOverlayShell';
import { Button } from '@ui/primitives/button';
import { THEME_COLORS } from '@ui-constants/theme.constant';
import { useRouter } from 'next/navigation';
import {
  type ChangeEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useForm } from 'react-hook-form';
import BrandEditorForm from './BrandEditorForm';
import BrandOverviewPanel from './BrandOverviewPanel';
import {
  type BrandEditorTab,
  type BrandFormValues,
  type BrandOverlayRecord,
  type BrandOverlayView,
  buildSocialConnections,
} from './ModalBrand.types';

const DEFAULT_BRAND_FORM_VALUES: BrandFormValues = {
  backgroundColor: THEME_COLORS.PRIMARY,
  defaultImageModel: '',
  defaultImageToVideoModel: '',
  defaultMusicModel: '',
  defaultVideoModel: '',
  description: '',
  fontFamily: 'montserrat-regular',
  label: '',
  primaryColor: THEME_COLORS.PRIMARY,
  secondaryColor: THEME_COLORS.SECONDARY,
  slug: '',
  text: '',
};

const DEFAULT_BRAND_LINK_FORM_VALUES: BrandLinkEditorValues = {
  category: LinkCategory.WEBSITE,
  label: '',
  url: '',
};

export default function BrandOverlay({
  brand,
  onConfirm,
  isOpen,
  openKey,
  onClose,
  initialView = 'edit',
}: BrandOverlayProps) {
  const { organizationId } = useBrand();
  const { push } = useRouter();
  const { orgSlug } = useOrgUrl();
  const { settings } = useOrganization();
  const clipboardService = ClipboardService.getInstance();
  const shouldAutoOpen = isOpen ?? Boolean(brand);
  const initialBrand = useMemo(
    () =>
      brand
        ? (new Brand(brand as Partial<IBrand>) as BrandOverlayRecord)
        : null,
    [brand],
  );

  useModalAutoOpen(ModalEnum.BRAND, {
    isOpen: shouldAutoOpen,
    openKey,
  });

  const getBrandsService = useAuthedService((token: string) =>
    BrandsService.getInstance(token),
  );
  const getPromptsService = useAuthedService((token: string) =>
    PromptsService.getInstance(token),
  );
  const getAssetsService = useAuthedService((token: string) =>
    AssetsService.getInstance(token),
  );
  const getLinksService = useAuthedService((token: string) =>
    LinksService.getInstance(token),
  );

  const { imageModels, musicModels, videoModels, fontFamilies } = useElements();
  const { openConfirm } = useConfirmModal();
  const { openUpload } = useUploadModal();
  const { subscribe } = useSocketManager();

  const [error, setError] = useState<string | null>(null);
  const [editorTab, setEditorTab] = useState<BrandEditorTab>('info');
  const [overlayView, setOverlayView] = useState<BrandOverlayView>(
    brand ? initialView : 'edit',
  );
  const [overlayBrandId, setOverlayBrandId] = useState<string | null>(
    brand?.id ?? null,
  );
  const [selectedLink, setSelectedLink] = useState<ILink | null>(null);
  const [isLinkEditorOpen, setIsLinkEditorOpen] = useState(false);
  const [linkFormValues, setLinkFormValues] = useState<BrandLinkEditorValues>(
    DEFAULT_BRAND_LINK_FORM_VALUES,
  );
  const [linkEditorError, setLinkEditorError] = useState<string | null>(null);
  const [isSubmittingLink, setIsSubmittingLink] = useState(false);
  const [generateModalType, setGenerateModalType] = useState<
    'banner' | 'logo' | null
  >(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [previousPrompt, setPreviousPrompt] = useState<string | null>(null);
  const undoTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const promptSubscriptionRef = useRef<(() => void) | null>(null);

  const form = useForm<BrandFormValues>({
    defaultValues: DEFAULT_BRAND_FORM_VALUES,
    mode: 'onChange',
  });

  const queryClient = useQueryClient();
  const brandModalKey = ['brand-modal', overlayBrandId];

  const {
    data: loadedBrand,
    isLoading: isLoadingBrand,
    refetch: refreshBrand,
  } = useQuery({
    queryKey: brandModalKey,
    queryFn: async () => {
      if (!overlayBrandId) {
        throw new Error('Brand ID is required');
      }

      const service = await getBrandsService();
      return (await service.findOne(overlayBrandId)) as BrandOverlayRecord;
    },
    enabled: !!overlayBrandId,
  });

  const mutateBrand = useCallback(
    (brandId: string, data: BrandOverlayRecord) => {
      queryClient.setQueryData(['brand-modal', brandId], data);
    },
    [queryClient],
  );

  const activeBrand: BrandOverlayRecord | null =
    loadedBrand ??
    (overlayBrandId && initialBrand?.id === overlayBrandId
      ? initialBrand
      : null);

  useEffect(() => {
    setOverlayBrandId(brand?.id ?? null);
    setOverlayView(brand ? initialView : 'edit');
    setSelectedLink(null);
    setIsLinkEditorOpen(false);
    setLinkFormValues(DEFAULT_BRAND_LINK_FORM_VALUES);
    setLinkEditorError(null);
    setGenerateModalType(null);
  }, [brand, initialView]);

  useEffect(() => {
    if (!activeBrand) {
      if (!overlayBrandId) {
        form.reset(DEFAULT_BRAND_FORM_VALUES);
      }
      return;
    }

    form.reset({
      backgroundColor:
        activeBrand.backgroundColor ||
        DEFAULT_BRAND_FORM_VALUES.backgroundColor,
      defaultImageModel: activeBrand.defaultImageModel || '',
      defaultImageToVideoModel: activeBrand.defaultImageToVideoModel || '',
      defaultMusicModel: activeBrand.defaultMusicModel || '',
      defaultVideoModel: activeBrand.defaultVideoModel || '',
      description: activeBrand.description || '',
      fontFamily:
        activeBrand.fontFamily || DEFAULT_BRAND_FORM_VALUES.fontFamily,
      label: activeBrand.label || '',
      primaryColor:
        activeBrand.primaryColor || DEFAULT_BRAND_FORM_VALUES.primaryColor,
      secondaryColor:
        activeBrand.secondaryColor || DEFAULT_BRAND_FORM_VALUES.secondaryColor,
      slug: activeBrand.slug || '',
      text: activeBrand.text || '',
    });
  }, [activeBrand, form, overlayBrandId]);

  const cleanupPromptSubscription = useCallback(() => {
    if (promptSubscriptionRef.current) {
      promptSubscriptionRef.current();
      promptSubscriptionRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      cleanupPromptSubscription();
      if (undoTimeoutRef.current) {
        clearTimeout(undoTimeoutRef.current);
      }
    };
  }, [cleanupPromptSubscription]);

  const handleCopyPrompt = useCallback(async () => {
    await clipboardService.copyToClipboard(form.getValues('text'));
  }, [clipboardService, form]);

  const handleCopy = useCallback(
    async (text?: string) => {
      if (!text) {
        return;
      }

      await clipboardService.copyToClipboard(text);
    },
    [clipboardService],
  );

  const handleUndo = useCallback(() => {
    if (previousPrompt !== null) {
      form.setValue('text', previousPrompt);
      setPreviousPrompt(null);

      if (undoTimeoutRef.current) {
        clearTimeout(undoTimeoutRef.current);
        undoTimeoutRef.current = null;
      }
    }
  }, [form, previousPrompt]);

  const listenForSocket = useCallback(
    (promptId: string) => {
      const event = WebSocketPaths.prompt(promptId);
      const timeoutId = setTimeout(() => {
        logger.error('Brand prompt enhancement timed out');
        setError('Prompt enhancement timed out. Please try again.');
        setIsGenerating(false);
        cleanupPromptSubscription();
      }, 30000);

      const handler = createPromptHandler<string>(
        (result: string) => {
          clearTimeout(timeoutId);
          form.setValue('text', result);
          setIsGenerating(false);
          cleanupPromptSubscription();

          if (undoTimeoutRef.current) {
            clearTimeout(undoTimeoutRef.current);
          }

          undoTimeoutRef.current = setTimeout(() => {
            setPreviousPrompt(null);
            undoTimeoutRef.current = null;
          }, 30000);
        },
        (socketError: string) => {
          clearTimeout(timeoutId);
          logger.error(
            'Brand prompt enhancement failed via websocket',
            socketError,
          );
          setError('Prompt enhancement failed. Please try again.');
          setIsGenerating(false);
          cleanupPromptSubscription();
        },
      );

      cleanupPromptSubscription();
      promptSubscriptionRef.current = subscribe(event, handler);
    },
    [cleanupPromptSubscription, form, subscribe],
  );

  const enhanceDescription = useCallback(async () => {
    setPreviousPrompt(form.getValues('text') || null);

    if (undoTimeoutRef.current) {
      clearTimeout(undoTimeoutRef.current);
      undoTimeoutRef.current = null;
    }

    setIsGenerating(true);

    try {
      const service = await getPromptsService();
      const prompt = await service.post(
        new Prompt({
          category: PromptCategory.BRAND_DESCRIPTION,
          isSkipEnhancement: false,
          organization: organizationId,
          original: form.getValues('text'),
          systemPromptKey: SystemPromptKey.BRAND,
          useRAG: true,
        }),
      );

      listenForSocket(prompt.id);
    } catch (promptError) {
      logger.error('Failed to enhance brand prompt', promptError);
      setError('Failed to enhance brand prompt');
      setIsGenerating(false);
    }
  }, [form, getPromptsService, listenForSocket, organizationId]);

  const updateModalBrand = useCallback(
    (
      event: ChangeEvent<
        HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
      >,
    ) => {
      const { name, value } = event.target;

      form.setValue(name as keyof BrandFormValues, value, {
        shouldValidate: true,
      });
    },
    [form],
  );

  const handleDismiss = useCallback(() => {
    closeModal(ModalEnum.BRAND);
  }, []);

  const closeModalBrand = useCallback(() => {
    setError(null);
    setSelectedLink(null);
    setGenerateModalType(null);
    onClose?.();
  }, [onClose]);

  const handleOpenUploadModal = useCallback(
    (category: AssetCategory) => {
      if (!overlayBrandId) {
        return;
      }

      openUpload({
        category,
        onConfirm: () => {
          void refreshBrand();
          onConfirm?.(true);
        },
        parentId: overlayBrandId,
        parentModel: 'Brand',
      });
    },
    [onConfirm, openUpload, overlayBrandId, refreshBrand],
  );

  const handleUpdateBrandField = useCallback(
    async (field: string, value: boolean | string) => {
      if (!overlayBrandId) {
        return;
      }

      try {
        const service = await getBrandsService();
        const updatedBrand = await service.patch(overlayBrandId, {
          [field]: value,
        });
        mutateBrand(overlayBrandId, updatedBrand as BrandOverlayRecord);
        onConfirm?.(true);
      } catch (updateError) {
        logger.error('Failed to update brand field', updateError);
        setError('Failed to update brand field');
      }
    },
    [getBrandsService, mutateBrand, onConfirm, overlayBrandId],
  );

  const handleRequestDeleteReference = useCallback(
    (assetId: string) => {
      openConfirm({
        cancelLabel: 'Cancel',
        confirmLabel: 'Delete',
        isError: true,
        label: 'Delete Branding Reference',
        message: 'Are you sure you want to delete this branding reference?',
        onConfirm: async () => {
          try {
            const service = await getAssetsService();
            await service.delete(assetId);
            await refreshBrand();
            onConfirm?.(true);
          } catch (deleteError) {
            logger.error('Failed to delete branding reference', deleteError);
            setError('Failed to delete branding reference');
          }
        },
      });
    },
    [getAssetsService, onConfirm, openConfirm, refreshBrand],
  );

  const handleOpenLinkModal = useCallback((link?: ILink) => {
    setSelectedLink(link ?? null);
    setLinkFormValues({
      category: link?.category ?? LinkCategory.WEBSITE,
      label: link?.label ?? '',
      url: link?.url ?? '',
    });
    setLinkEditorError(null);
    setIsLinkEditorOpen(true);
  }, []);

  const closeLinkEditor = useCallback(() => {
    setSelectedLink(null);
    setLinkFormValues(DEFAULT_BRAND_LINK_FORM_VALUES);
    setLinkEditorError(null);
    setIsLinkEditorOpen(false);
  }, []);

  const handleLinkFieldChange = useCallback(
    (
      event: ChangeEvent<
        HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
      >,
    ) => {
      const { name, value } = event.target;
      setLinkFormValues((current) => ({
        ...current,
        [name]: value,
      }));
    },
    [],
  );

  const handleLinkSubmit = useCallback(async () => {
    if (!overlayBrandId) {
      return;
    }

    if (!linkFormValues.label.trim() || !linkFormValues.url.trim()) {
      setLinkEditorError('Label and URL are required.');
      return;
    }

    try {
      new URL(linkFormValues.url);
    } catch {
      setLinkEditorError('Enter a valid URL, including http:// or https://.');
      return;
    }

    setIsSubmittingLink(true);
    setLinkEditorError(null);

    try {
      const service = await getLinksService();
      const payload = {
        brand: overlayBrandId,
        category: linkFormValues.category,
        label: linkFormValues.label.trim(),
        url: linkFormValues.url.trim(),
      } as unknown as Partial<Link>;

      if (selectedLink?.id) {
        await service.patch(selectedLink.id, payload);
      } else {
        await service.post(payload);
      }

      await refreshBrand();
      onConfirm?.(true);
      closeLinkEditor();
    } catch (linkError) {
      logger.error('Failed to save brand link', linkError);
      setLinkEditorError('Failed to save link');
    } finally {
      setIsSubmittingLink(false);
    }
  }, [
    closeLinkEditor,
    getLinksService,
    linkFormValues,
    onConfirm,
    overlayBrandId,
    refreshBrand,
    selectedLink?.id,
  ]);

  const handleLinkDelete = useCallback(async () => {
    if (!selectedLink?.id) {
      return;
    }

    setIsSubmittingLink(true);
    setLinkEditorError(null);

    try {
      const service = await getLinksService();
      await service.delete(selectedLink.id);
      await refreshBrand();
      onConfirm?.(true);
      closeLinkEditor();
    } catch (linkError) {
      logger.error('Failed to delete brand link', linkError);
      setLinkEditorError('Failed to delete link');
    } finally {
      setIsSubmittingLink(false);
    }
  }, [closeLinkEditor, getLinksService, onConfirm, refreshBrand, selectedLink]);

  const handleGenerateBanner = useCallback(() => {
    setGenerateModalType('banner');
    openModal(ModalEnum.BRAND_GENERATE);
  }, []);

  const handleGenerateLogo = useCallback(() => {
    setGenerateModalType('logo');
    openModal(ModalEnum.BRAND_GENERATE);
  }, []);

  const handleGenerateConfirm = useCallback(async () => {
    setGenerateModalType(null);
    await refreshBrand();
    onConfirm?.(true);
  }, [onConfirm, refreshBrand]);

  const submitModalBrand = useCallback(async () => {
    try {
      const service = await getBrandsService();
      const formData = {
        ...form.getValues(),
        isDeleted: false,
        isSelected: false,
      };

      if (overlayBrandId) {
        const updatedBrand = await service.patch(overlayBrandId, formData);
        mutateBrand(overlayBrandId, updatedBrand as BrandOverlayRecord);
        await refreshBrand();
        onConfirm?.(true);
        setOverlayView('overview');
      } else {
        const createdBrand = await service.post(
          new Brand(formData as Partial<IBrand>),
        );
        const createdBrandDetail = await service.findOne(createdBrand.id);

        setOverlayBrandId(createdBrand.id);
        mutateBrand(createdBrand.id, createdBrandDetail as BrandOverlayRecord);
        onConfirm?.(true, createdBrand.id);
        setOverlayView('overview');
      }
    } catch (submitError) {
      logger.error('Failed to save brand', submitError);

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
    mutateBrand,
    onConfirm,
    overlayBrandId,
    refreshBrand,
  ]);

  const { isSubmitting, onSubmit } = useFormSubmitWithState(() =>
    submitModalBrand(),
  );

  const socialConnections = useMemo(
    () => buildSocialConnections(activeBrand),
    [activeBrand],
  );

  const connectedPlatformsCount = useMemo(
    () =>
      activeBrand?.credentials?.filter(
        (credential) => credential.isConnected === true,
      ).length || 0,
    [activeBrand?.credentials],
  );

  const generateCost = useMemo(() => {
    const modelToUse =
      activeBrand?.defaultImageModel ||
      MODEL_KEYS.REPLICATE_GOOGLE_IMAGEN_4_FAST;
    const model = imageModels.find(
      (imageModel) => imageModel.key === modelToUse,
    );
    return model?.cost || 5;
  }, [activeBrand?.defaultImageModel, imageModels]);

  const overlayTitle = activeBrand?.label || 'Brand';
  const overlayDescription = activeBrand
    ? `${activeBrand.description || 'Brand context and configuration'}`
    : 'Create a new brand without leaving the current page.';
  const organizationSettingsDefaults = settings as
    | {
        defaultImageModel?: string | null;
        defaultImageToVideoModel?: string | null;
        defaultMusicModel?: string | null;
        defaultVideoModel?: string | null;
      }
    | undefined;
  const organizationDefaults = useMemo(
    () => ({
      defaultImageModel:
        organizationSettingsDefaults?.defaultImageModel ?? null,
      defaultImageToVideoModel:
        organizationSettingsDefaults?.defaultImageToVideoModel ?? null,
      defaultMusicModel:
        organizationSettingsDefaults?.defaultMusicModel ?? null,
      defaultVideoModel:
        organizationSettingsDefaults?.defaultVideoModel ?? null,
    }),
    [organizationSettingsDefaults],
  );

  return (
    <>
      <EntityOverlayShell
        id={ModalEnum.BRAND}
        title={overlayTitle}
        description={overlayDescription}
        width={activeBrand ? '2xl' : 'xl'}
        surface="flat"
        onClose={closeModalBrand}
        onOpenDetail={
          activeBrand?.slug
            ? () => push(`/${orgSlug}/${activeBrand.slug}/settings`)
            : undefined
        }
        badges={
          activeBrand ? (
            <>
              <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[11px] uppercase tracking-[0.22em] text-foreground/55">
                Brand
              </span>
              <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-xs text-foreground/70">
                {activeBrand.scope === AssetScope.PUBLIC ? 'Public' : 'Private'}
              </span>
              <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-xs text-foreground/70">
                {connectedPlatformsCount} connected
              </span>
            </>
          ) : (
            <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[11px] uppercase tracking-[0.22em] text-foreground/55">
              New Brand
            </span>
          )
        }
        actions={
          activeBrand ? (
            <div className="flex items-center gap-2">
              {overlayView === 'overview' ? (
                <Button
                  label="Edit"
                  variant={ButtonVariant.SECONDARY}
                  size={ButtonSize.SM}
                  onClick={() => setOverlayView('edit')}
                />
              ) : (
                <Button
                  label="Overview"
                  variant={ButtonVariant.SECONDARY}
                  size={ButtonSize.SM}
                  onClick={() => setOverlayView('overview')}
                />
              )}
            </div>
          ) : null
        }
      >
        {isLoadingBrand && !activeBrand ? (
          <div className="flex min-h-[40vh] items-center justify-center">
            <span className="text-sm text-foreground/60">Loading brand…</span>
          </div>
        ) : null}

        {!isLoadingBrand || activeBrand ? (
          overlayView === 'edit' || !activeBrand ? (
            <div className="mx-auto w-full max-w-5xl">
              <BrandEditorForm
                activeBrand={activeBrand}
                editorTab={editorTab}
                error={error}
                fontFamilies={fontFamilies}
                form={form}
                imageModels={imageModels}
                isGenerating={isGenerating}
                isSubmitting={isSubmitting}
                musicModels={musicModels}
                onCancel={() => {
                  if (activeBrand) {
                    setOverlayView('overview');
                    return;
                  }

                  handleDismiss();
                }}
                onChange={updateModalBrand}
                onEnhanceDescription={enhanceDescription}
                onSubmit={onSubmit}
                onTabChange={setEditorTab}
                onUndo={handleUndo}
                onCopyPrompt={handleCopyPrompt}
                organizationDefaults={organizationDefaults}
                previousPrompt={previousPrompt}
                videoModels={videoModels}
              />
            </div>
          ) : (
            <BrandOverviewPanel
              activeBrand={activeBrand}
              connectedPlatformsCount={connectedPlatformsCount}
              error={error}
              isLinkEditorOpen={isLinkEditorOpen}
              isSubmittingLink={isSubmittingLink}
              linkEditorError={linkEditorError}
              linkFormValues={linkFormValues}
              selectedLink={selectedLink}
              socialConnections={socialConnections}
              onCopy={handleCopy}
              onDeleteReference={handleRequestDeleteReference}
              onEditBrand={() => setOverlayView('edit')}
              onGenerateBanner={handleGenerateBanner}
              onGenerateLogo={handleGenerateLogo}
              onLinkCancel={closeLinkEditor}
              onLinkDelete={handleLinkDelete}
              onLinkFieldChange={handleLinkFieldChange}
              onLinkSubmit={handleLinkSubmit}
              onOpenLinkModal={handleOpenLinkModal}
              onRefreshBrand={async () => {
                await refreshBrand();
                onConfirm?.(true);
              }}
              onTogglePublicProfile={(isPublic) =>
                void handleUpdateBrandField(
                  'scope',
                  isPublic ? AssetScope.PUBLIC : AssetScope.BRAND,
                )
              }
              onUploadBanner={() => handleOpenUploadModal(AssetCategory.BANNER)}
              onUploadLogo={() => handleOpenUploadModal(AssetCategory.LOGO)}
              onUploadReference={() =>
                handleOpenUploadModal(AssetCategory.REFERENCE)
              }
            />
          )
        ) : null}
      </EntityOverlayShell>

      {activeBrand && generateModalType ? (
        <LazyModalBrandGenerate
          type={generateModalType}
          cost={generateCost}
          brandId={activeBrand.id}
          onConfirm={() => {
            void handleGenerateConfirm();
          }}
        />
      ) : null}
    </>
  );
}
