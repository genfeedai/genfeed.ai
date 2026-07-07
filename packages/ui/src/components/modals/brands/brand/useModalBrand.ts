'use client';

import { createBrandAppRoute, MODEL_KEYS } from '@genfeedai/constants';
import { useAccessState } from '@genfeedai/contexts/providers/access-state/access-state.provider';
import {
  useConfirmModal,
  useUploadModal,
} from '@genfeedai/contexts/providers/global-modals/global-modals.provider';
import { useBrand } from '@genfeedai/contexts/user/brand-context/brand-context';
import {
  type AssetCategory,
  LinkCategory,
  MemberRole,
  ModalEnum,
  PromptCategory,
  SystemPromptKey,
} from '@genfeedai/enums';
import {
  closeModal,
  openModal,
} from '@genfeedai/helpers/ui/modal/modal.helper';
import { useAuthedService } from '@genfeedai/hooks/auth/use-authed-service/use-authed-service';
import { useUserRole } from '@genfeedai/hooks/auth/use-user-role/use-user-role';
import { useElements } from '@genfeedai/hooks/data/elements/use-elements/use-elements';
import { useOrganization } from '@genfeedai/hooks/data/organization/use-organization/use-organization';
import { useOrgUrl } from '@genfeedai/hooks/navigation/use-org-url';
import { useModalAutoOpen } from '@genfeedai/hooks/ui/use-modal-auto-open/use-modal-auto-open';
import { useFormSubmitWithState } from '@genfeedai/hooks/utils/use-form-submit/use-form-submit';
import { useSocketManager } from '@genfeedai/hooks/utils/use-socket-manager/use-socket-manager';
import type { IBrand, ILink, IStructuredError } from '@genfeedai/interfaces';
import { Prompt } from '@genfeedai/models/content/prompt.model';
import { Brand } from '@genfeedai/models/organization/brand.model';
import type { Link } from '@genfeedai/models/social/link.model';
import type { BrandOverlayProps } from '@genfeedai/props/modals/modal.props';
import { AssetsService } from '@genfeedai/services/content/assets.service';
import { PromptsService } from '@genfeedai/services/content/prompts.service';
import { ClipboardService } from '@genfeedai/services/core/clipboard.service';
import { logger } from '@genfeedai/services/core/logger.service';
import { NotificationsService } from '@genfeedai/services/core/notifications.service';
import { createPromptHandler } from '@genfeedai/services/core/socket-manager.service';
import { OrganizationsService } from '@genfeedai/services/organization/organizations.service';
import type { IBrandRelocationPreview } from '@genfeedai/services/social/brand-relocation.types';
import { BrandsService } from '@genfeedai/services/social/brands.service';
import { LinksService } from '@genfeedai/services/social/links.service';
import { hasErrorDetail } from '@genfeedai/utils/error/error-handler.util';
import { WebSocketPaths } from '@genfeedai/utils/network/websocket.util';
import type { BrandLinkEditorValues } from '@pages/brands/components/sidebar/BrandDetailLinkEditor';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { THEME_COLORS } from '@ui-constants/theme.constant';
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
import { useForm } from 'react-hook-form';
import { buildMovingResourcesSummary } from './brand-relocation-summary.util';
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
  organizationId: '',
  primaryColor: THEME_COLORS.PRIMARY,
  secondaryColor: THEME_COLORS.SECONDARY,
  slug: '',
  text: '',
};

export type OrganizationOption = {
  id: string;
  label: string;
};

function getStructuredErrorStatus(error: unknown): number | undefined {
  if (!error || typeof error !== 'object') {
    return undefined;
  }
  const status = (error as IStructuredError).status;
  return typeof status === 'number' ? status : undefined;
}

const DEFAULT_BRAND_LINK_FORM_VALUES: BrandLinkEditorValues = {
  category: LinkCategory.WEBSITE,
  label: '',
  url: '',
};

export type UseModalBrandReturn = {
  activeBrand: BrandOverlayRecord | null;
  canMoveOrganization: boolean;
  connectedPlatformsCount: number;
  currentOrganizationId: string | null;
  editorTab: BrandEditorTab;
  error: string | null;
  fontFamilies: ReturnType<typeof useElements>['fontFamilies'];
  form: ReturnType<typeof useForm<BrandFormValues>>;
  generateCost: number;
  generateModalType: 'banner' | 'logo' | null;
  imageModels: ReturnType<typeof useElements>['imageModels'];
  isGenerating: boolean;
  isLinkEditorOpen: boolean;
  isLoadingBrand: boolean;
  isSubmitting: boolean;
  isSubmittingLink: boolean;
  linkEditorError: string | null;
  linkFormValues: BrandLinkEditorValues;
  musicModels: ReturnType<typeof useElements>['musicModels'];
  navigateToBrandSettings: (() => void) | undefined;
  organizationDefaults: {
    defaultImageModel: string | null;
    defaultImageToVideoModel: string | null;
    defaultMusicModel: string | null;
    defaultVideoModel: string | null;
  };
  organizationOptions: OrganizationOption[];
  overlayBrandId: string | null;
  overlayDescription: string;
  overlayTitle: string;
  overlayView: BrandOverlayView;
  previousPrompt: string | null;
  selectedLink: ILink | null;
  socialConnections: ReturnType<typeof buildSocialConnections>;
  videoModels: ReturnType<typeof useElements>['videoModels'];
  closeLinkEditor: () => void;
  closeModalBrand: () => void;
  enhanceDescription: () => Promise<void>;
  handleCopy: (text?: string) => Promise<void>;
  handleCopyPrompt: () => Promise<void>;
  handleDismiss: () => void;
  handleGenerateBanner: () => void;
  handleGenerateConfirm: () => Promise<void>;
  handleGenerateLogo: () => void;
  handleLinkDelete: () => Promise<void>;
  handleLinkFieldChange: (
    event: ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >,
  ) => void;
  handleLinkSubmit: () => Promise<void>;
  handleOpenLinkModal: (link?: ILink) => void;
  handleOpenUploadModal: (category: AssetCategory) => void;
  handleRequestDeleteReference: (assetId: string) => void;
  handleUpdateBrandField: (
    field: string,
    value: boolean | string,
  ) => Promise<void>;
  onChange: (
    event: ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >,
  ) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  onUndo: () => void;
  refreshBrand: () => Promise<unknown>;
  setEditorTab: (tab: BrandEditorTab) => void;
  setOverlayView: (view: BrandOverlayView) => void;
};

export function useModalBrand(
  props: Pick<
    BrandOverlayProps,
    'brand' | 'isOpen' | 'onClose' | 'onConfirm' | 'openKey' | 'initialView'
  >,
): UseModalBrandReturn {
  const {
    brand,
    isOpen,
    onClose,
    onConfirm,
    openKey,
    initialView = 'edit',
  } = props;

  const { organizationId, refreshBrands } = useBrand();
  const { isSuperAdmin } = useAccessState();
  const role = useUserRole();
  const hasElevatedRole =
    role === MemberRole.OWNER || role === MemberRole.ADMIN;
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
  const getOrgsService = useAuthedService((token: string) =>
    OrganizationsService.getInstance(token),
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

  const currentOrganizationId = activeBrand?.organization?.id ?? null;

  const { data: organizationOptionsData } = useQuery({
    queryKey: ['brand-modal-organization-options', isSuperAdmin],
    queryFn: async (): Promise<OrganizationOption[]> => {
      const service = await getOrgsService();
      if (isSuperAdmin) {
        const organizations = await service.getAllOrganizations();
        return organizations.map((organization) => ({
          id: organization.id,
          label: organization.label,
        }));
      }
      const organizations = await service.getMyOrganizations();
      return organizations.map((organization) => ({
        id: organization.id,
        label: organization.label,
      }));
    },
  });

  const organizationOptions = organizationOptionsData ?? [];
  const canMoveOrganization =
    isSuperAdmin || (hasElevatedRole && organizationOptions.length >= 2);

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
      organizationId: activeBrand.organization?.id || '',
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

  const performBrandSubmit = useCallback(
    async (isOrganizationChange: boolean) => {
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
          if (isOrganizationChange) {
            await refreshBrands();
          }
          onConfirm?.(true);
          setOverlayView('overview');
        } else {
          const createdBrand = await service.post(
            new Brand(formData as Partial<IBrand>),
          );
          const createdBrandDetail = await service.findOne(createdBrand.id);

          setOverlayBrandId(createdBrand.id);
          mutateBrand(
            createdBrand.id,
            createdBrandDetail as BrandOverlayRecord,
          );
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

        const status = getStructuredErrorStatus(submitError);
        if (status === 409) {
          setError(
            "Couldn't move the brand — the destination organization has a conflicting record.",
          );
          return;
        }
        if (status === 403) {
          setError(
            "You don't have permission to move this brand to that organization.",
          );
          return;
        }

        setError('Failed to save brand');
      }
    },
    [
      form,
      getBrandsService,
      mutateBrand,
      onConfirm,
      overlayBrandId,
      refreshBrand,
      refreshBrands,
    ],
  );

  const buildRelocationConfirmMessage = useCallback(
    (
      brandLabel: string,
      destinationLabel: string,
      preview: IBrandRelocationPreview,
    ): string => {
      const { soleBrandWorkflows, staleMembers } = preview.counts;
      const sentences: string[] = [
        `${brandLabel} moves to ${destinationLabel}.`,
      ];
      const movingResourcesSummary = buildMovingResourcesSummary(
        preview.movingResources,
      );

      if (movingResourcesSummary) {
        sentences.push(movingResourcesSummary);
      } else if (soleBrandWorkflows > 0) {
        sentences.push(
          `${soleBrandWorkflows} dedicated workflow${soleBrandWorkflows === 1 ? '' : 's'} move${soleBrandWorkflows === 1 ? 's' : ''} with it.`,
        );
      }

      if (staleMembers > 0) {
        sentences.push(
          `${staleMembers} member${staleMembers === 1 ? '' : 's'} will lose access.`,
        );
      }

      sentences.push('This cannot be easily undone.');

      return sentences.join(' ');
    },
    [],
  );

  const performBrandRelocation = useCallback(
    async (
      destOrganizationId: string,
      ackToken: string | null,
      onAckRejected: () => void,
    ) => {
      if (!overlayBrandId) {
        return;
      }

      try {
        const service = await getBrandsService();
        const formData = {
          ...form.getValues(),
          isDeleted: false,
          isSelected: false,
        };

        const { brand: updatedBrand, summary } = await service.relocateBrand(
          overlayBrandId,
          {
            ...formData,
            organizationId: destOrganizationId,
            ...(ackToken ? { relocationAck: ackToken } : {}),
          },
        );

        mutateBrand(overlayBrandId, updatedBrand as BrandOverlayRecord);
        await refreshBrand();
        await refreshBrands();
        onConfirm?.(true);
        setOverlayView('overview');

        const summaryParts: string[] = [];
        if (summary.workflowsClonedActive > 0) {
          summaryParts.push(
            `${summary.workflowsClonedActive} copied & running`,
          );
        }
        if (summary.workflowsClonedPaused > 0) {
          summaryParts.push(
            `${summary.workflowsClonedPaused} paused for review`,
          );
        }
        if (summary.workflowsMoved > 0) {
          summaryParts.push(`${summary.workflowsMoved} moved`);
        }

        const summaryMessage = summaryParts.length
          ? ` — ${summaryParts.join(', ')}`
          : '';
        const schedulingNote =
          summary.schedulingPending > 0
            ? ' Scheduling is still pending for some workflows.'
            : '';

        NotificationsService.getInstance().success(
          `Moved to destination organization${summaryMessage}.${schedulingNote}`,
        );
      } catch (relocationError) {
        logger.error('Failed to relocate brand', relocationError);

        const status = getStructuredErrorStatus(relocationError);
        if (status === 409) {
          setError(
            'The move impact changed since you last previewed it — please confirm the move again.',
          );
          onAckRejected();
          return;
        }
        if (status === 403) {
          setError(
            "You don't have permission to move this brand to that organization.",
          );
          return;
        }

        setError('Failed to save brand');
      }
    },
    [
      form,
      getBrandsService,
      mutateBrand,
      onConfirm,
      overlayBrandId,
      refreshBrand,
      refreshBrands,
    ],
  );

  const submitModalBrand = useCallback(async () => {
    const nextOrganizationId = form.getValues().organizationId;
    const isOrganizationChange =
      !!overlayBrandId &&
      !!currentOrganizationId &&
      !!nextOrganizationId &&
      nextOrganizationId !== currentOrganizationId;

    if (!isOrganizationChange) {
      await performBrandSubmit(false);
      return;
    }

    const destinationOrganization = organizationOptions.find(
      (option) => option.id === nextOrganizationId,
    );
    const destinationLabel =
      destinationOrganization?.label ?? 'that organization';
    const brandLabel = form.getValues().label || 'This brand';

    const resetOrganizationSelection = () => {
      form.setValue('organizationId', currentOrganizationId ?? '', {
        shouldValidate: true,
      });
    };

    try {
      const service = await getBrandsService();
      const preview = await service.getRelocationPreview(
        overlayBrandId as string,
        nextOrganizationId,
      );

      openConfirm({
        cancelLabel: 'Cancel',
        confirmLabel: 'Move brand',
        isError: true,
        label: 'Move brand to another organization?',
        message: buildRelocationConfirmMessage(
          brandLabel,
          destinationLabel,
          preview,
        ),
        onConfirm: async () => {
          await performBrandRelocation(
            nextOrganizationId,
            preview.ackToken,
            resetOrganizationSelection,
          );
        },
        onClose: resetOrganizationSelection,
      });
    } catch (previewError) {
      logger.error('Failed to load brand relocation preview', previewError);
      setError(
        "Couldn't check the move's impact on resources and members. Please try again.",
      );
      resetOrganizationSelection();
    }
  }, [
    buildRelocationConfirmMessage,
    currentOrganizationId,
    form,
    getBrandsService,
    openConfirm,
    organizationOptions,
    overlayBrandId,
    performBrandRelocation,
    performBrandSubmit,
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

  const navigateToBrandSettings = activeBrand?.slug
    ? () => push(createBrandAppRoute(orgSlug, activeBrand.slug, '/settings'))
    : undefined;

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

  return {
    activeBrand,
    canMoveOrganization,
    connectedPlatformsCount,
    currentOrganizationId,
    editorTab,
    error,
    fontFamilies,
    form,
    generateCost,
    generateModalType,
    imageModels,
    isGenerating,
    isLinkEditorOpen,
    isLoadingBrand,
    isSubmitting,
    isSubmittingLink,
    linkEditorError,
    linkFormValues,
    musicModels,
    navigateToBrandSettings,
    organizationDefaults,
    organizationOptions,
    overlayBrandId,
    overlayDescription,
    overlayTitle,
    overlayView,
    previousPrompt,
    selectedLink,
    socialConnections,
    videoModels,
    closeLinkEditor,
    closeModalBrand,
    enhanceDescription,
    handleCopy,
    handleCopyPrompt,
    handleDismiss,
    handleGenerateBanner,
    handleGenerateConfirm,
    handleGenerateLogo,
    handleLinkDelete,
    handleLinkFieldChange,
    handleLinkSubmit,
    handleOpenLinkModal,
    handleOpenUploadModal,
    handleRequestDeleteReference,
    handleUpdateBrandField,
    onChange: updateModalBrand,
    onSubmit,
    onUndo: handleUndo,
    refreshBrand,
    setEditorTab,
    setOverlayView,
  };
}
