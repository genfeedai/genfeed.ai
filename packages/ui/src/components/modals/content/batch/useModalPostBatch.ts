import {
  type MultiPostSchema,
  multiPostSchema,
} from '@genfeedai/client/schemas';
import { useBrand } from '@genfeedai/contexts/user/brand-context/brand-context';
import {
  CredentialPlatform,
  IngredientCategory,
  ModalEnum,
  PostVisibility,
} from '@genfeedai/contracts';
import type { CreatePostRequest } from '@genfeedai/contracts/api-types';
import type {
  ICredential,
  IIngredient,
  IMetadata,
  IOrganizationSetting,
  IPostPlatformConfig,
} from '@genfeedai/contracts/interfaces';
import type { PlatformSubmissionStatus } from '@genfeedai/contracts/interfaces/modals/platform-submission-status.interface';
import { getBrowserTimezone } from '@genfeedai/helpers/formatting/timezone/timezone.helper';
import { closeModal } from '@genfeedai/helpers/ui/modal/modal.helper';
import { useAuthedService } from '@genfeedai/hooks/auth/use-authed-service/use-authed-service';
import { useFocusFirstInput } from '@genfeedai/hooks/ui/use-focus-first-input/use-focus-first-input';
import { useModalAutoOpen } from '@genfeedai/hooks/ui/use-modal-auto-open/use-modal-auto-open';
import { useFormSubmitWithState } from '@genfeedai/hooks/utils/use-form-submit/use-form-submit';
import type { ModalPostBatchProps } from '@genfeedai/props/modals/modal.props';
import { PostsService } from '@genfeedai/services/content/posts.service';
import { EnvironmentService } from '@genfeedai/services/core/environment.service';
import { logger } from '@genfeedai/services/core/logger.service';
import { NotificationsService } from '@genfeedai/services/core/notifications.service';
import { CredentialsService } from '@genfeedai/services/organization/credentials.service';
import { OrganizationsService } from '@genfeedai/services/organization/organizations.service';
import { ErrorHandler } from '@genfeedai/utils/error/error-handler.util';
import { standardSchemaResolver } from '@hookform/resolvers/standard-schema';
import { useRouter } from 'next/navigation';
import {
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useForm, useWatch } from 'react-hook-form';
import {
  nextSchedulerInstant,
  resolvePublishingTimezone,
  syncPlatformConfigs,
} from './batch-platform-sync';
import { getAvailablePlatforms } from './batch-post.utils';

export interface AspectRatioInfo {
  height: number;
  isPortrait: boolean;
  width: number;
}

export interface UseModalPostBatchReturn {
  // form
  form: ReturnType<typeof useForm<MultiPostSchema>>;
  formRef: React.RefObject<HTMLFormElement>;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  isSubmitting: boolean;
  // tab
  activeTab: 'setup' | 'platforms' | 'results';
  handleTabChange: (tab: 'setup' | 'platforms') => void;
  handleNextStep: () => void;
  handlePreviousStep: () => void;
  platformConfigs: IPostPlatformConfig[];
  applyEnabledCredentialIds: (credentialIds: string[]) => void;
  togglePlatform: (credentialId: string) => void;
  updatePlatformConfig: (
    credentialId: string,
    updates: Partial<IPostPlatformConfig>,
  ) => void;
  // schedule
  globalScheduledDate: Date | null;
  setGlobalScheduledDate: (date: Date | null) => void;
  getMinDateTime: () => Date;
  // org settings
  settings: IOrganizationSetting | undefined;
  // derived / flags
  activeIngredients: IIngredient[];
  isCarousel: boolean;
  enabledCount: number;
  hasYoutube: boolean;
  hasAvailableCredentials: boolean;
  hasInvalidCredentials: boolean;
  invalidCredentialConfigs: IPostPlatformConfig[];
  invalidCredentialSummary: string;
  isStep1Complete: boolean;
  isFormValid: boolean;
  aspectRatioInfo: AspectRatioInfo;
  shouldBeFullScreen: boolean;
  // watched fields
  globalDescription: string;
  globalLabel: string;
  // error
  error: string | null;
  setError: (error: string | null) => void;
  // actions
  closeModalPost: () => void;
  openCredentials: () => void;
  // status
  platformStatuses: PlatformSubmissionStatus[];
  isRefreshingTokens: boolean;
}

export function useModalPostBatch(props: ModalPostBatchProps) {
  const {
    ingredient,
    ingredients,
    credentials,
    onConfirm,
    onClose,
    isOpen,
    openKey,
  } = props;

  const { organizationId, refreshBrands } = useBrand();
  const { push } = useRouter();
  const [error, setError] = useState<string | null>(null);

  const onConfirmRef = useRef(onConfirm);
  onConfirmRef.current = onConfirm;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const notificationsService = useMemo(
    () => NotificationsService.getInstance(),
    [],
  );

  const getPostsService = useAuthedService((token: string) =>
    PostsService.getInstance(token),
  );

  const getCredentialsService = useAuthedService((token: string) =>
    CredentialsService.getInstance(token),
  );

  const getOrganizationsService = useAuthedService((token: string) =>
    OrganizationsService.getInstance(token),
  );

  const [isRefreshingTokens, setIsRefreshingTokens] = useState(false);
  const hasAttemptedRefreshRef = useRef(false);

  const isCredentialValid = useCallback(
    (credential: ICredential | undefined): boolean => {
      if (!credential?.isConnected) {
        return false;
      }

      const expiryValue = credential.accessTokenExpiry;
      if (!expiryValue) {
        return false;
      }

      const expiryDate = new Date(expiryValue);
      if (Number.isNaN(expiryDate.getTime())) {
        return false;
      }

      return expiryDate.getTime() > Date.now() + 60_000;
    },
    [],
  );

  const [activeTab, setActiveTab] = useState<'setup' | 'platforms' | 'results'>(
    'setup',
  );
  const [platformConfigs, setPlatformConfigs] = useState<IPostPlatformConfig[]>(
    [],
  );
  const platformConfigsRef = useRef(platformConfigs);
  platformConfigsRef.current = platformConfigs;
  const hasInitializedDate = useRef(false);
  const hasUserEditedPlatforms = useRef(false);
  const hasUserEditedSchedule = useRef(false);
  const platformInitKeyRef = useRef<string | null>(null);
  const isPublishingRef = useRef(false);
  const [platformStatuses, setPlatformStatuses] = useState<
    PlatformSubmissionStatus[]
  >([]);

  const [settings, setSettings] = useState<IOrganizationSetting | undefined>(
    undefined,
  );

  const [globalScheduledDate, setGlobalScheduledDate] = useState<Date | null>(
    null,
  );
  const scheduleTimezone = useMemo(
    () => resolvePublishingTimezone(settings?.timezone, getBrowserTimezone()),
    [settings?.timezone],
  );

  const credentialsLoadedRef = useRef(false);

  const getMinDateTime = useCallback(
    () => nextSchedulerInstant(new Date(), scheduleTimezone),
    [scheduleTimezone],
  );

  const setScheduledDate = useCallback((date: Date | null) => {
    hasUserEditedSchedule.current = true;
    setGlobalScheduledDate(date);
  }, []);

  const findOrganizationSettings = useCallback(
    async (signal?: AbortSignal) => {
      if (!organizationId) {
        return;
      }

      const url = `GET /organizations/${organizationId}/settings`;

      try {
        const service = await getOrganizationsService();
        const organizationSettings = await service.getSettings(organizationId);

        if (signal?.aborted) {
          return;
        }

        if (organizationSettings) {
          setSettings(organizationSettings);
        }

        logger.info(`${url} success`, organizationSettings);
      } catch (err) {
        logger.error(`${url} failed`, err);
      }
    },
    [organizationId, getOrganizationsService],
  );

  const activeIngredients = useMemo(
    () => ingredients || (ingredient ? [ingredient] : []),
    [ingredients, ingredient],
  );

  const isCarousel = activeIngredients.length > 1;

  useModalAutoOpen(ModalEnum.POST_BATCH, {
    isOpen:
      isOpen ?? Boolean(ingredient || (ingredients && ingredients.length > 0)),
    openKey,
  });

  const form = useForm<MultiPostSchema>({
    defaultValues: {
      globalDescription: '',
      globalLabel: '',
      platforms: [],
      scheduledDate: '',
      visibility: PostVisibility.UNLISTED,
    },
    resolver: standardSchemaResolver(multiPostSchema),
  });

  const closeModalPost = useCallback(() => {
    closeModal(ModalEnum.POST_BATCH);

    setTimeout(() => {
      form.reset();
      hasInitializedDate.current = false;
      hasUserEditedPlatforms.current = false;
      hasUserEditedSchedule.current = false;
      platformInitKeyRef.current = null;
      isPublishingRef.current = false;
      credentialsLoadedRef.current = false;
      hasAttemptedRefreshRef.current = false;

      setPlatformConfigs([]);
      setGlobalScheduledDate(null);
      setActiveTab('setup');
      setError(null);
      setPlatformStatuses([]);

      onConfirmRef.current?.();
      onCloseRef.current?.();
    }, 300);
  }, [form]);

  const openCredentials = useCallback(() => {
    push(`${EnvironmentService.apps.app}/credentials`);
  }, [push]);

  const handleSubmit = useCallback(async () => {
    if (activeTab !== 'platforms' || isPublishingRef.current) {
      return;
    }

    setError(null);

    if (!activeIngredients || activeIngredients.length === 0) {
      return setError(
        'At least one ingredient is required to schedule a publication',
      );
    }

    if (!credentialsLoadedRef.current) {
      return setError(
        'Credentials are still loading. Please wait a moment and try again.',
      );
    }

    if (!credentials || credentials.length === 0) {
      return setError(
        'No credentials available. Please connect your social media accounts first.',
      );
    }

    const invalidEnabledPlatforms = platformConfigs.filter((config) => {
      if (
        !config.enabled ||
        !config.credentialId ||
        config.credentialId.trim() === ''
      ) {
        return false;
      }

      const credential = credentials.find(
        (item) => item.id === config.credentialId,
      );

      return !isCredentialValid(credential);
    });

    if (invalidEnabledPlatforms.length > 0) {
      return setError(
        'One or more connected accounts need to be reconnected before publishing.',
      );
    }

    const enabledPlatforms = platformConfigs.filter((config) => {
      if (
        !config.enabled ||
        !config.credentialId ||
        config.credentialId.trim() === ''
      ) {
        return false;
      }

      const credential = credentials.find(
        (item) => item.id === config.credentialId,
      );

      return isCredentialValid(credential);
    });

    if (enabledPlatforms.length === 0) {
      return setError(
        'Please select at least one platform with valid credentials',
      );
    }

    const shouldConfirmInstagram = enabledPlatforms.some(
      (config) => config.platform === CredentialPlatform.INSTAGRAM,
    );

    if (shouldConfirmInstagram) {
      const shouldContinue = window.confirm(
        'This will schedule posts for Instagram. Continue?',
      );

      if (!shouldContinue) {
        return;
      }
    }

    const initialStatuses: PlatformSubmissionStatus[] = enabledPlatforms.map(
      (config) => ({
        credentialId: config.credentialId,
        handle: config.handle,
        platform: config.platform as CredentialPlatform,
        status: 'pending' as const,
      }),
    );

    setPlatformStatuses(initialStatuses);
    setActiveTab('results');
    isPublishingRef.current = true;

    const url = 'POST /publishing';
    try {
      const service = await getPostsService();

      let successCount = 0;
      let failureCount = 0;

      for (const config of enabledPlatforms) {
        setPlatformStatuses((prev) =>
          prev.map((status) =>
            status.credentialId === config.credentialId
              ? { ...status, status: 'submitting' as const }
              : status,
          ),
        );

        try {
          const localDate =
            config.overrideSchedule && config.customScheduledDate
              ? new Date(config.customScheduledDate)
              : (globalScheduledDate ?? new Date());

          const scheduledDate = localDate.toISOString();

          const body = {
            category: config.category,
            credentialId: config.credentialId,
            description: config.description,
            ingredients: activeIngredients.map((ing: IIngredient) => ing.id),
            isRepeat: false,
            isShareToFeedSelected: config.isShareToFeedSelected,
            label: config.label,
            scheduledDate,
            targetExecutionState: config.targetExecutionState,
            timezone: scheduleTimezone,
            visibility: config.visibility,
          } as CreatePostRequest;

          await service.post(body);

          setPlatformStatuses((prev) =>
            prev.map((status) =>
              status.credentialId === config.credentialId
                ? { ...status, status: 'completed' as const }
                : status,
            ),
          );

          successCount++;
        } catch (err) {
          const errorDetails = ErrorHandler.extractErrorDetails(err);

          setPlatformStatuses((prev) =>
            prev.map((status) =>
              status.credentialId === config.credentialId
                ? {
                    ...status,
                    error: errorDetails.message || 'Failed to schedule',
                    status: 'failed' as const,
                  }
                : status,
            ),
          );

          failureCount++;
          logger.error(
            `${url} failed for ${config.platform}`,
            errorDetails.message,
          );
        }
      }

      if (successCount > 0) {
        notificationsService.success(
          `Scheduled for ${successCount} platform${successCount !== 1 ? 's' : ''}${
            failureCount > 0 ? ` (${failureCount} failed)` : ''
          }`,
        );
      }

      logger.info(
        `${url} completed: ${successCount} success, ${failureCount} failed`,
      );
    } catch (err) {
      logger.error(`${url} failed`, err);

      const errorDetails = ErrorHandler.extractErrorDetails(err);

      let errorMessage =
        errorDetails.message || 'Failed to schedule publication';

      if (
        errorDetails.validationErrors &&
        errorDetails.validationErrors.length > 0
      ) {
        const validationMessages = errorDetails.validationErrors
          .map((e) => `${e.field}: ${e.message}`)
          .join(', ');
        errorMessage = `Validation failed: ${validationMessages}`;
      }

      setError(errorMessage);
    } finally {
      isPublishingRef.current = false;
    }
  }, [
    activeIngredients,
    activeTab,
    credentials,
    getPostsService,
    globalScheduledDate,
    isCredentialValid,
    notificationsService,
    platformConfigs,
    scheduleTimezone,
  ]);

  const formRef = useFocusFirstInput<HTMLFormElement>();
  const submitHandler = useCallback(async () => {
    await form.handleSubmit(handleSubmit)();
  }, [form, handleSubmit]);

  const { isSubmitting, onSubmit } = useFormSubmitWithState(submitHandler);

  // Fetch org settings when modal has active ingredients
  useEffect(() => {
    const abortController = new AbortController();

    if (organizationId && activeIngredients.length > 0) {
      startTransition(() => {
        void findOrganizationSettings(abortController.signal);
      });
    }

    return () => {
      abortController.abort();
    };
  }, [activeIngredients.length, findOrganizationSettings, organizationId]);

  useEffect(() => {
    if (!hasInitializedDate.current || hasUserEditedSchedule.current) {
      return;
    }

    setGlobalScheduledDate(getMinDateTime());
  }, [getMinDateTime]);

  // Initialize platform configs once per ingredient set. Credential refreshes
  // update validity without rebuilding audience or enabled choices.
  useEffect(() => {
    if (!activeIngredients || activeIngredients.length === 0) {
      platformInitKeyRef.current = null;
      hasUserEditedPlatforms.current = false;
      startTransition(() => {
        setPlatformConfigs([]);
        setGlobalScheduledDate(null);
        hasInitializedDate.current = false;
        hasUserEditedSchedule.current = false;
      });
      return;
    }

    credentialsLoadedRef.current = true;

    const ingredientKey = activeIngredients.map((item) => item.id).join(',');
    const isNewSession = platformInitKeyRef.current !== ingredientKey;
    if (isNewSession) {
      hasUserEditedPlatforms.current = false;
      platformInitKeyRef.current = ingredientKey;
    }

    const firstIngredient = activeIngredients[0];
    const isImage = firstIngredient.category === IngredientCategory.IMAGE;
    const availablePlatforms = getAvailablePlatforms(
      firstIngredient.category,
      isCarousel,
    );
    const snapshots = (credentials ?? []).map((credential) => ({
      externalHandle: credential.externalHandle,
      id: credential.id,
      isValid: isCredentialValid(credential),
      platform: credential.platform,
    }));
    const configs = syncPlatformConfigs({
      credentials: snapshots,
      hasUserEdited: !isNewSession && hasUserEditedPlatforms.current,
      isImage,
      platforms: availablePlatforms,
      previous: platformConfigsRef.current,
    });

    startTransition(() => {
      platformConfigsRef.current = configs;
      setPlatformConfigs(configs);
      form.setValue('platforms', configs);
      if (!hasInitializedDate.current) {
        setGlobalScheduledDate(getMinDateTime());
        hasInitializedDate.current = true;
      }
    });
  }, [
    activeIngredients,
    credentials,
    form,
    getMinDateTime,
    isCarousel,
    isCredentialValid,
  ]);

  // Auto-refresh expired tokens when modal opens
  useEffect(() => {
    if (
      !credentials ||
      credentials.length === 0 ||
      !ingredient ||
      hasAttemptedRefreshRef.current ||
      isRefreshingTokens
    ) {
      return;
    }

    const expiredCredentials = credentials.filter(
      (cred) => cred.isConnected && !isCredentialValid(cred),
    );

    if (expiredCredentials.length === 0) {
      return;
    }

    hasAttemptedRefreshRef.current = true;
    setIsRefreshingTokens(true);

    const refreshAll = async () => {
      try {
        const service = await getCredentialsService();
        let refreshedCount = 0;

        await Promise.allSettled(
          expiredCredentials.map(async (cred) => {
            try {
              await service.refreshCredential(cred.id);
              refreshedCount++;
            } catch (err) {
              logger.error(
                `Failed to refresh credential ${cred.platform}`,
                err,
              );
            }
          }),
        );

        if (refreshedCount > 0) {
          await refreshBrands();
        }
      } catch (err) {
        logger.error('Failed to refresh expired credentials', err);
      } finally {
        setIsRefreshingTokens(false);
      }
    };

    void refreshAll();
  }, [
    credentials,
    ingredient,
    isCredentialValid,
    isRefreshingTokens,
    getCredentialsService,
    refreshBrands,
  ]);

  const handleNextStep = () => {
    const globalLabel = form.getValues('globalLabel');
    const globalDesc = form.getValues('globalDescription');

    if (!globalScheduledDate) {
      return setError('Please select a scheduled date');
    }

    setPlatformConfigs((prev) =>
      prev.map((config) => ({
        ...config,
        description: config.description || globalDesc || '',
        label:
          config.platform === CredentialPlatform.TWITTER
            ? ''
            : config.label || globalLabel || '',
      })),
    );

    setActiveTab('platforms');
  };

  const handlePreviousStep = () => {
    setActiveTab('setup');
  };

  const handleTabChange = (tab: 'setup' | 'platforms') => {
    if (tab === 'platforms' && !isStep1Complete) {
      return;
    }
    setActiveTab(tab);
  };

  const togglePlatform = (credentialId: string) => {
    hasUserEditedPlatforms.current = true;
    setPlatformConfigs((prev) =>
      prev.map((config) =>
        config.credentialId === credentialId
          ? config.isCredentialValid === false
            ? config
            : { ...config, enabled: !config.enabled }
          : config,
      ),
    );
  };

  const applyEnabledCredentialIds = (credentialIds: string[]) => {
    hasUserEditedPlatforms.current = true;
    const selected = new Set(credentialIds);
    setPlatformConfigs((prev) =>
      prev.map((config) => ({
        ...config,
        enabled:
          selected.has(config.credentialId) &&
          config.isCredentialValid !== false,
      })),
    );
  };

  const updatePlatformConfig = (
    credentialId: string,
    updates: Partial<IPostPlatformConfig>,
  ) => {
    hasUserEditedPlatforms.current = true;
    setPlatformConfigs((prev) =>
      prev.map((config) =>
        config.credentialId === credentialId
          ? { ...config, ...updates }
          : config,
      ),
    );
  };

  const invalidCredentialConfigs = useMemo(
    () =>
      platformConfigs.filter(
        (config) =>
          config.credentialId &&
          config.credentialId.trim() !== '' &&
          config.isCredentialValid === false,
      ),
    [platformConfigs],
  );

  const invalidCredentialSummary = useMemo(() => {
    if (invalidCredentialConfigs.length === 0) {
      return '';
    }

    return invalidCredentialConfigs
      .map((config) => {
        if (config.handle) {
          return `${config.platform} (@${config.handle})`;
        }
        return config.platform;
      })
      .join(', ');
  }, [invalidCredentialConfigs]);

  const enabledCount = platformConfigs.filter(
    (config) =>
      config.enabled &&
      config.credentialId &&
      config.credentialId.trim() !== '' &&
      config.isCredentialValid !== false,
  ).length;

  const hasYoutube = platformConfigs.some(
    (config) => config.platform === CredentialPlatform.YOUTUBE,
  );

  const hasValidCredentials = platformConfigs.some(
    (config) =>
      config.credentialId &&
      config.credentialId.trim() !== '' &&
      config.isCredentialValid !== false,
  );

  const hasAvailableCredentials = hasValidCredentials;
  const hasInvalidCredentials = invalidCredentialConfigs.length > 0;

  const globalDescription = useWatch({
    control: form.control,
    name: 'globalDescription',
  });
  const globalLabel = useWatch({
    control: form.control,
    name: 'globalLabel',
  });

  const isStep1Complete =
    !!globalScheduledDate &&
    !!globalDescription?.trim() &&
    (!hasYoutube || !!globalLabel?.trim());

  const areAllPlatformsValid = useMemo(() => {
    const enabledPlatforms = platformConfigs.filter(
      (config) =>
        config.enabled &&
        config.credentialId &&
        config.credentialId.trim() !== '' &&
        config.isCredentialValid !== false,
    );

    if (enabledPlatforms.length === 0) {
      return false;
    }

    return enabledPlatforms.every((config) => {
      const isTwitter = config.platform === CredentialPlatform.TWITTER;
      const hasTitle = isTwitter || !!config.label?.trim();
      const hasDescription = !!config.description?.trim();
      const hasSchedule =
        !config.overrideSchedule ||
        (config.overrideSchedule && !!config.customScheduledDate);

      return hasTitle && hasDescription && hasSchedule;
    });
  }, [platformConfigs]);

  const isFormValid = isStep1Complete && areAllPlatformsValid;

  const getAspectRatioInfo = (): AspectRatioInfo => {
    if (!ingredient) {
      return { height: 1920, isPortrait: false, width: 1920 };
    }

    const metadata =
      typeof ingredient.metadata === 'object' && ingredient.metadata
        ? (ingredient.metadata as IMetadata)
        : null;

    const width = metadata?.width || ingredient.metadataWidth || 1920;
    const height = metadata?.height || ingredient.metadataHeight || 1920;
    const isPortrait = height > width;

    return { height, isPortrait, width };
  };

  const aspectRatioInfo = getAspectRatioInfo();

  const shouldBeFullScreen =
    !!ingredient &&
    credentials &&
    credentials?.length > 0 &&
    hasAvailableCredentials &&
    activeTab !== 'results';

  return {
    form,
    formRef,
    onSubmit,
    isSubmitting,
    activeTab,
    handleTabChange,
    handleNextStep,
    handlePreviousStep,
    platformConfigs,
    applyEnabledCredentialIds,
    togglePlatform,
    updatePlatformConfig,
    globalScheduledDate,
    setGlobalScheduledDate: setScheduledDate,
    getMinDateTime,
    settings,
    activeIngredients,
    isCarousel,
    enabledCount,
    hasYoutube,
    hasAvailableCredentials,
    hasInvalidCredentials,
    invalidCredentialConfigs,
    invalidCredentialSummary,
    isStep1Complete,
    isFormValid,
    aspectRatioInfo,
    shouldBeFullScreen,
    globalDescription: globalDescription ?? '',
    globalLabel: globalLabel ?? '',
    error,
    setError,
    closeModalPost,
    openCredentials,
    platformStatuses,
    isRefreshingTokens,
  };
}
