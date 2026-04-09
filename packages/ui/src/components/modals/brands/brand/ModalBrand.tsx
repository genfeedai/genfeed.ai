'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import { MODEL_KEYS } from '@genfeedai/constants';
import {
  AlertCategory,
  AssetCategory,
  AssetScope,
  ButtonSize,
  ButtonVariant,
  CredentialPlatform,
  LinkCategory,
  ModalEnum,
  PromptCategory,
  SystemPromptKey,
} from '@genfeedai/enums';
import type { IBrand, IFontFamily, ILink, IModel } from '@genfeedai/interfaces';
import {
  hasFormErrors,
  parseFormErrors,
} from '@helpers/ui/form-error/form-error.helper';
import { closeModal, openModal } from '@helpers/ui/modal/modal.helper';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useElements } from '@hooks/data/elements/use-elements/use-elements';
import { useOrganization } from '@hooks/data/organization/use-organization/use-organization';
import { useResource } from '@hooks/data/resource/use-resource/use-resource';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import { useModalAutoOpen } from '@hooks/ui/use-modal-auto-open/use-modal-auto-open';
import { useFormSubmitWithState } from '@hooks/utils/use-form-submit/use-form-submit';
import { useSocketManager } from '@hooks/utils/use-socket-manager/use-socket-manager';
import { Prompt } from '@models/content/prompt.model';
import { Brand } from '@models/organization/brand.model';
import type { Link } from '@models/social/link.model';
import BrandDetailBanner from '@pages/brands/components/banner/BrandDetailBanner';
import BrandDetailSidebar from '@pages/brands/components/detail-sidebar/BrandDetailSidebar';
import BrandDetailOverview from '@pages/brands/components/overview/BrandDetailOverview';
import BrandDetailLinkEditor, {
  type BrandLinkEditorValues,
} from '@pages/brands/components/sidebar/BrandDetailLinkEditor';
import BrandDetailSystemPrompt from '@pages/brands/components/system-prompt/BrandDetailSystemPrompt';
import type { BrandOverlayProps } from '@props/modals/modal.props';
import type { BrandDetailSocialConnection } from '@props/pages/brand-detail.props';
import {
  useConfirmModal,
  useUploadModal,
} from '@providers/global-modals/global-modals.provider';
import { AssetsService } from '@services/content/assets.service';
import { PromptsService } from '@services/content/prompts.service';
import { ClipboardService } from '@services/core/clipboard.service';
import { EnvironmentService } from '@services/core/environment.service';
import { logger } from '@services/core/logger.service';
import { createPromptHandler } from '@services/core/socket-manager.service';
import { BrandsService } from '@services/social/brands.service';
import { LinksService } from '@services/social/links.service';
import TextareaLabelActions from '@ui/content/textarea-label-actions/TextareaLabelActions';
import Alert from '@ui/feedback/alert/Alert';
import { LazyModalBrandGenerate } from '@ui/lazy/modal/LazyModal';
import Tabs from '@ui/navigation/tabs/Tabs';
import EntityOverlayShell from '@ui/overlays/entity/EntityOverlayShell';
import { Button } from '@ui/primitives/button';
import FormColorPicker from '@ui/primitives/color-picker';
import FormControl from '@ui/primitives/field';
import { Input } from '@ui/primitives/input';
import { SelectField } from '@ui/primitives/select';
import { Textarea } from '@ui/primitives/textarea';
import { THEME_COLORS } from '@ui-constants/theme.constant';
import { hasErrorDetail } from '@utils/error/error-handler.util';
import { WebSocketPaths } from '@utils/network/websocket.util';
import { useRouter } from 'next/navigation';
import {
  type ChangeEvent,
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { type UseFormReturn, useForm } from 'react-hook-form';

type BrandOverlayView = 'edit' | 'overview';
type BrandEditorTab = 'branding' | 'info' | 'models';
type BrandOverlayRecord = Brand &
  IBrand & {
    defaultImageModel?: string | null;
    defaultImageToVideoModel?: string | null;
    defaultMusicModel?: string | null;
    defaultVideoModel?: string | null;
    links?: ILink[];
  };

interface BrandFormValues {
  backgroundColor: string;
  defaultImageModel: string;
  defaultImageToVideoModel: string;
  defaultMusicModel: string;
  defaultVideoModel: string;
  description: string;
  fontFamily: string;
  slug: string;
  label: string;
  primaryColor: string;
  secondaryColor: string;
  text: string;
}

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

const BRAND_PANEL_CLASS_NAME =
  'rounded-3xl border border-white/[0.08] bg-card/80 shadow-[0_18px_50px_rgba(0,0,0,0.24)] backdrop-blur-sm';

interface BrandEditorFormProps {
  activeBrand: BrandOverlayRecord | null;
  editorTab: BrandEditorTab;
  error: string | null;
  fontFamilies: IFontFamily[];
  form: UseFormReturn<BrandFormValues>;
  imageModels: IModel[];
  isGenerating: boolean;
  isSubmitting: boolean;
  musicModels: IModel[];
  onCancel: () => void;
  onChange: (
    e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
  ) => void;
  onEnhanceDescription: () => Promise<void>;
  onSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  onTabChange: (tab: BrandEditorTab) => void;
  onUndo: () => void;
  onCopyPrompt: () => Promise<void>;
  organizationDefaults: {
    defaultImageModel?: string | null;
    defaultImageToVideoModel?: string | null;
    defaultMusicModel?: string | null;
    defaultVideoModel?: string | null;
  };
  previousPrompt: string | null;
  videoModels: IModel[];
}

function getInheritedModelOptionLabel(
  value: string | null | undefined,
  models: IModel[],
): string {
  if (!value) {
    return 'Use organization default';
  }

  return `Use organization default (${models.find((model) => model.key === value)?.label ?? value})`;
}

function buildSocialConnections(
  brand: BrandOverlayRecord | null,
): BrandDetailSocialConnection[] {
  if (!brand) {
    return [];
  }

  const connections: BrandDetailSocialConnection[] = [];
  const isPlatformConnected = (platform: CredentialPlatform): boolean =>
    !!brand.credentials?.some(
      (credential) =>
        credential.platform === platform && credential.isConnected === true,
    );

  if (isPlatformConnected(CredentialPlatform.YOUTUBE) && brand.youtubeUrl) {
    connections.push({
      handle: brand.youtubeHandle,
      platform: CredentialPlatform.YOUTUBE,
      url: brand.youtubeUrl,
    });
  }

  if (isPlatformConnected(CredentialPlatform.TIKTOK) && brand.tiktokUrl) {
    connections.push({
      handle: brand.tiktokHandle,
      platform: CredentialPlatform.TIKTOK,
      url: brand.tiktokUrl,
    });
  }

  if (isPlatformConnected(CredentialPlatform.INSTAGRAM) && brand.instagramUrl) {
    connections.push({
      handle: brand.instagramHandle,
      platform: CredentialPlatform.INSTAGRAM,
      url: brand.instagramUrl,
    });
  }

  if (isPlatformConnected(CredentialPlatform.TWITTER) && brand.twitterUrl) {
    connections.push({
      handle: brand.twitterHandle,
      platform: CredentialPlatform.TWITTER,
      url: brand.twitterUrl,
    });
  }

  return connections;
}

function BrandEditorForm({
  activeBrand,
  editorTab,
  error,
  fontFamilies,
  form,
  imageModels,
  isGenerating,
  isSubmitting,
  musicModels,
  onCancel,
  onChange,
  onEnhanceDescription,
  onSubmit,
  onTabChange,
  onUndo,
  onCopyPrompt,
  organizationDefaults,
  previousPrompt,
  videoModels,
}: BrandEditorFormProps) {
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-6">
      {error ? (
        <Alert type={AlertCategory.ERROR}>
          <div className="space-y-1">{error}</div>
        </Alert>
      ) : null}

      {hasFormErrors(form.formState.errors) ? (
        <Alert type={AlertCategory.ERROR}>
          <div className="space-y-1">
            {parseFormErrors(form.formState.errors).map((formError, index) => (
              <div key={index}>{formError}</div>
            ))}
          </div>
        </Alert>
      ) : null}

      <Tabs
        tabs={[
          { id: 'info', label: 'Info' },
          { id: 'models', label: 'Models' },
          { id: 'branding', label: 'Branding' },
        ]}
        activeTab={editorTab}
        onTabChange={(id) => onTabChange(id as BrandEditorTab)}
      />

      <div className={`${BRAND_PANEL_CLASS_NAME} p-5`}>
        {editorTab === 'info' ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <FormControl label="Label">
                <Input
                  type="text"
                  name="label"
                  control={form.control}
                  onChange={onChange}
                  placeholder="Enter brand name"
                  isRequired={true}
                  isDisabled={isSubmitting || isGenerating}
                />
              </FormControl>

              <FormControl label="Slug">
                <Input
                  type="text"
                  name="slug"
                  control={form.control}
                  onChange={onChange}
                  placeholder="Enter public slug"
                  isRequired={true}
                  isDisabled={isSubmitting || isGenerating}
                />
              </FormControl>
            </div>

            <FormControl label="Description">
              <Input
                type="text"
                name="description"
                control={form.control}
                onChange={onChange}
                placeholder="Describe the brand"
                isRequired={true}
                isDisabled={isSubmitting || isGenerating}
              />
            </FormControl>
          </div>
        ) : null}

        {editorTab === 'models' ? (
          <div className="space-y-4">
            <p className="text-sm text-foreground/65">
              Leave a field empty to inherit the organization-level generation
              default for this brand.
            </p>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <FormControl label="Default Video Model">
                <SelectField
                  name="defaultVideoModel"
                  control={form.control}
                  onChange={onChange}
                  isDisabled={isSubmitting || isGenerating}
                >
                  <option value="">
                    {getInheritedModelOptionLabel(
                      organizationDefaults.defaultVideoModel,
                      videoModels,
                    )}
                  </option>
                  {videoModels.map((model) => (
                    <option key={model.id} value={model.key}>
                      {model.label}
                    </option>
                  ))}
                </SelectField>
              </FormControl>

              <FormControl label="Default Image Model">
                <SelectField
                  name="defaultImageModel"
                  control={form.control}
                  onChange={onChange}
                  isDisabled={isSubmitting || isGenerating}
                >
                  <option value="">
                    {getInheritedModelOptionLabel(
                      organizationDefaults.defaultImageModel,
                      imageModels,
                    )}
                  </option>
                  {imageModels.map((model) => (
                    <option key={model.id} value={model.key}>
                      {model.label}
                    </option>
                  ))}
                </SelectField>
              </FormControl>

              <FormControl label="Default Image-to-Video Model">
                <SelectField
                  name="defaultImageToVideoModel"
                  control={form.control}
                  onChange={onChange}
                  isDisabled={isSubmitting || isGenerating}
                >
                  <option value="">
                    {getInheritedModelOptionLabel(
                      organizationDefaults.defaultImageToVideoModel,
                      videoModels,
                    )}
                  </option>
                  {videoModels.map((model) => (
                    <option key={model.id} value={model.key}>
                      {model.label}
                    </option>
                  ))}
                </SelectField>
              </FormControl>

              <FormControl label="Default Music Model">
                <SelectField
                  name="defaultMusicModel"
                  control={form.control}
                  onChange={onChange}
                  isDisabled={isSubmitting || isGenerating}
                >
                  <option value="">
                    {getInheritedModelOptionLabel(
                      organizationDefaults.defaultMusicModel,
                      musicModels,
                    )}
                  </option>
                  {musicModels.map((model) => (
                    <option key={model.id} value={model.key}>
                      {model.label}
                    </option>
                  ))}
                </SelectField>
              </FormControl>
            </div>
          </div>
        ) : null}

        {editorTab === 'branding' ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
              <FormControl label="Font Family" isRequired={true}>
                <SelectField
                  name="fontFamily"
                  control={form.control}
                  onChange={onChange}
                  isDisabled={isSubmitting || isGenerating}
                >
                  {fontFamilies.map((font) => (
                    <option key={font.key} value={font.key}>
                      {font.label}
                    </option>
                  ))}
                </SelectField>
              </FormControl>

              <FormColorPicker
                label="Primary Color"
                value={form.getValues('primaryColor') || THEME_COLORS.PRIMARY}
                isRequired={true}
                isDisabled={isSubmitting || isGenerating}
                onChange={(color) =>
                  form.setValue('primaryColor', color, {
                    shouldValidate: true,
                  })
                }
              />

              <FormColorPicker
                label="Secondary Color"
                value={
                  form.getValues('secondaryColor') || THEME_COLORS.SECONDARY
                }
                isRequired={true}
                isDisabled={isSubmitting || isGenerating}
                onChange={(color) =>
                  form.setValue('secondaryColor', color, {
                    shouldValidate: true,
                  })
                }
              />

              <FormColorPicker
                label="Background Color"
                value={form.getValues('backgroundColor') || '#FFFFFF'}
                isRequired={true}
                isDisabled={isSubmitting || isGenerating}
                position="right"
                onChange={(color) =>
                  form.setValue('backgroundColor', color, {
                    shouldValidate: true,
                  })
                }
              />
            </div>

            <FormControl
              label={
                <TextareaLabelActions
                  label="Brand System Prompt"
                  onCopy={onCopyPrompt}
                  onEnhance={onEnhanceDescription}
                  onUndo={onUndo}
                  showUndo={!!previousPrompt}
                  isCopyDisabled={!form.getValues('text')}
                  isEnhanceDisabled={
                    isSubmitting || isGenerating || !form.getValues('text')
                  }
                  isEnhancing={isSubmitting || isGenerating}
                  enhanceTooltip="Improve brand system prompt"
                />
              }
            >
              <Textarea
                name="text"
                control={form.control}
                onChange={onChange}
                placeholder="Enter the brand system prompt"
                className="w-full resize-none border border-input px-3 py-2"
                isDisabled={isSubmitting || isGenerating}
              />
            </FormControl>
          </div>
        ) : null}
      </div>

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Button
          label={activeBrand ? 'Back' : 'Cancel'}
          variant={ButtonVariant.SECONDARY}
          size={ButtonSize.LG}
          className="md:h-9 md:px-4 md:py-2"
          isLoading={isSubmitting}
          onClick={onCancel}
        />

        <Button
          type="submit"
          label={activeBrand ? 'Save changes' : 'Create brand'}
          variant={ButtonVariant.DEFAULT}
          isLoading={isSubmitting || isGenerating}
          isDisabled={isSubmitting || isGenerating || !form.formState.isValid}
        />
      </div>
    </form>
  );
}

export default function BrandOverlay({
  brand,
  onConfirm,
  isOpen,
  openKey,
  onClose,
  initialView = 'edit',
}: BrandOverlayProps) {
  const { organizationId } = useBrand();
  const router = useRouter();
  const { orgHref } = useOrgUrl();
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

  const {
    data: loadedBrand,
    isLoading: isLoadingBrand,
    refresh: refreshBrand,
    mutate: mutateBrand,
  } = useResource(
    async () => {
      if (!overlayBrandId) {
        throw new Error('Brand ID is required');
      }

      const service = await getBrandsService();
      return (await service.findOne(overlayBrandId)) as BrandOverlayRecord;
    },
    {
      dependencies: [overlayBrandId],
      enabled: !!overlayBrandId,
    },
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

  const handleChange = useCallback(
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

  const handleClose = useCallback(() => {
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
        mutateBrand(updatedBrand as BrandOverlayRecord);
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

  const handleSubmit = useCallback(async () => {
    try {
      const service = await getBrandsService();
      const formData = {
        ...form.getValues(),
        isDeleted: false,
        isSelected: false,
      };

      if (overlayBrandId) {
        const updatedBrand = await service.patch(overlayBrandId, formData);
        mutateBrand(updatedBrand as BrandOverlayRecord);
        await refreshBrand();
        onConfirm?.(true);
        setOverlayView('overview');
      } else {
        const createdBrand = await service.post(
          new Brand(formData as Partial<IBrand>),
        );
        const createdBrandDetail = await service.findOne(createdBrand.id);

        setOverlayBrandId(createdBrand.id);
        mutateBrand(createdBrandDetail as BrandOverlayRecord);
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
    handleSubmit(),
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
        onClose={handleClose}
        onOpenDetail={
          activeBrand?.id
            ? () => router.push(orgHref(`/settings/brands/${activeBrand.id}`))
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
                onChange={handleChange}
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
            <div className="space-y-6">
              {error ? (
                <Alert type={AlertCategory.ERROR}>
                  <div>{error}</div>
                </Alert>
              ) : null}

              <BrandDetailBanner
                brand={activeBrand}
                isGeneratingBanner={false}
                onUploadBanner={() =>
                  handleOpenUploadModal(AssetCategory.BANNER)
                }
                onGenerateBanner={handleGenerateBanner}
              />

              <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
                <div className="space-y-6 xl:col-span-8">
                  <div className={`${BRAND_PANEL_CLASS_NAME} p-6`}>
                    <BrandDetailOverview
                      brand={activeBrand}
                      isGeneratingLogo={false}
                      onUploadLogo={() =>
                        handleOpenUploadModal(AssetCategory.LOGO)
                      }
                      onGenerateLogo={handleGenerateLogo}
                      onEditBrand={() => setOverlayView('edit')}
                      onCopyPublicProfile={
                        activeBrand.scope === AssetScope.PUBLIC
                          ? () =>
                              handleCopy(
                                `${EnvironmentService.apps.website}/u/${activeBrand.slug}`,
                              )
                          : undefined
                      }
                    />
                  </div>

                  {activeBrand.text ? (
                    <div className={`${BRAND_PANEL_CLASS_NAME} p-6`}>
                      <BrandDetailSystemPrompt
                        text={activeBrand.text}
                        onCopy={handleCopy}
                      />
                    </div>
                  ) : null}
                </div>

                <div className="xl:col-span-4">
                  <div className="space-y-6">
                    <BrandDetailSidebar
                      brand={activeBrand}
                      brandId={activeBrand.id}
                      links={(activeBrand.links || []) as unknown as ILink[]}
                      socialConnections={socialConnections}
                      connectedPlatformsCount={connectedPlatformsCount}
                      deletingRefId={null}
                      onTogglePublicProfile={(isPublic) =>
                        handleUpdateBrandField(
                          'scope',
                          isPublic ? AssetScope.PUBLIC : AssetScope.BRAND,
                        )
                      }
                      onRefreshBrand={async () => {
                        await refreshBrand();
                        onConfirm?.(true);
                      }}
                      onOpenLinkModal={handleOpenLinkModal}
                      onUploadReference={() =>
                        handleOpenUploadModal(AssetCategory.REFERENCE)
                      }
                      onDeleteReference={handleRequestDeleteReference}
                    />

                    {isLinkEditorOpen ? (
                      <BrandDetailLinkEditor
                        error={linkEditorError}
                        isSubmitting={isSubmittingLink}
                        isEditing={Boolean(selectedLink)}
                        values={linkFormValues}
                        onChange={handleLinkFieldChange}
                        onCancel={closeLinkEditor}
                        onDelete={handleLinkDelete}
                        onSubmit={handleLinkSubmit}
                      />
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
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
