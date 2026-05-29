import {
  type MultiPostSchema,
  multiPostSchema,
} from '@genfeedai/client/schemas';
import { useBrand } from '@genfeedai/contexts/user/brand-context/brand-context';
import {
  CredentialPlatform,
  IngredientCategory,
  ModalEnum,
  PostCategory,
  PostStatus,
} from '@genfeedai/enums';
import { closeModal } from '@genfeedai/helpers/ui/modal/modal.helper';
import { useAuthedService } from '@genfeedai/hooks/auth/use-authed-service/use-authed-service';
import { useFocusFirstInput } from '@genfeedai/hooks/ui/use-focus-first-input/use-focus-first-input';
import { useModalAutoOpen } from '@genfeedai/hooks/ui/use-modal-auto-open/use-modal-auto-open';
import { useFormSubmitWithState } from '@genfeedai/hooks/utils/use-form-submit/use-form-submit';
import type {
  ICredential,
  IIngredient,
  IMetadata,
  IOrganizationSetting,
  IPostPlatformConfig,
} from '@genfeedai/interfaces';
import type { PlatformSubmissionStatus } from '@genfeedai/interfaces/modals/platform-submission-status.interface';
import type { ModalPostProps } from '@genfeedai/props/modals/modal.props';
import { PostsService } from '@genfeedai/services/content/posts.service';
import { EnvironmentService } from '@genfeedai/services/core/environment.service';
import { logger } from '@genfeedai/services/core/logger.service';
import { NotificationsService } from '@genfeedai/services/core/notifications.service';
import { CredentialsService } from '@genfeedai/services/organization/credentials.service';
import { OrganizationsService } from '@genfeedai/services/organization/organizations.service';
import { ErrorHandler } from '@genfeedai/utils/error/error-handler.util';
import { standardSchemaResolver } from '@hookform/resolvers/standard-schema';
import ModalPostContent from '@ui/modals/content/post/ModalPostContent';
import ModalPostFooter from '@ui/modals/content/post/ModalPostFooter';
import ModalPostHeader from '@ui/modals/content/post/ModalPostHeader';
import Modal from '@ui/modals/modal/Modal';
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
  getAvailablePlatforms,
  SCHEDULER_ALLOWED_MINUTES_SET,
} from './batch-post.utils';
import ModalPostBatchEmptyState from './ModalPostBatchEmptyState';
import ModalPostBatchFormAlerts from './ModalPostBatchFormAlerts';
import ModalPostBatchIngredientPreview from './ModalPostBatchIngredientPreview';
import ModalPostBatchResultsView from './ModalPostBatchResultsView';

export default function ModalPostBatch({
  ingredient,
  ingredients,
  credentials,
  onConfirm,
  onClose,
  isOpen,
  openKey,
}: ModalPostProps) {
  const { organizationId, refreshBrands } = useBrand();
  const { push } = useRouter();
  const [error, setError] = useState<string | null>(null);

  // Refs for callbacks to prevent re-renders
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

      const expiryValue =
        credential.accessTokenExpiry ?? credential.tokenExpiry;
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
  const hasInitializedDate = useRef(false);
  const [platformStatuses, setPlatformStatuses] = useState<
    PlatformSubmissionStatus[]
  >([]);

  const [settings, setSettings] = useState<IOrganizationSetting | undefined>(
    undefined,
  );

  const [globalScheduledDate, setGlobalScheduledDate] = useState<Date | null>(
    null,
  );

  // Track if credentials have been loaded at least once
  const credentialsLoadedRef = useRef(false);

  const getMinDateTime = useCallback(() => {
    const now = new Date();
    const nextAllowed = new Date(now);
    nextAllowed.setSeconds(0, 0);

    while (
      nextAllowed <= now ||
      !SCHEDULER_ALLOWED_MINUTES_SET.has(nextAllowed.getMinutes())
    ) {
      nextAllowed.setMinutes(nextAllowed.getMinutes() + 1);
    }

    return nextAllowed;
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
      } catch (error) {
        logger.error(`${url} failed`, error);
      }
    },
    [organizationId, getOrganizationsService],
  );

  // Support both single ingredient and carousel (ingredients array)
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
      youtubeStatus: PostStatus.UNLISTED,
    },
    resolver: standardSchemaResolver(multiPostSchema),
  });

  const closeModalPost = useCallback(() => {
    closeModal(ModalEnum.POST_BATCH);

    setTimeout(() => {
      form.reset();
      hasInitializedDate.current = false;
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
    setError(null); // Clear any previous errors

    if (!activeIngredients || activeIngredients.length === 0) {
      return setError(
        'At least one ingredient is required to schedule a publication',
      );
    }

    // Validate credentials are loaded before proceeding
    // Check both that credentials array exists and that we've had a chance to load them
    if (!credentialsLoadedRef.current) {
      return setError(
        'Credentials are still loading. Please wait a moment and try again.',
      );
    }

    // Also check if there are any credentials available
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

    // Initialize platform statuses with 'pending' state
    const initialStatuses: PlatformSubmissionStatus[] = enabledPlatforms.map(
      (config) => ({
        credentialId: config.credentialId,
        handle: config.handle,
        platform: config.platform as CredentialPlatform,
        status: 'pending' as const,
      }),
    );

    setPlatformStatuses(initialStatuses);

    // Switch to results tab immediately to show real-time progress
    setActiveTab('results');

    const url = 'POST /posts';
    try {
      const service = await getPostsService();

      // Generate a unique groupId for this batch of posts
      const groupId = Math.random().toString(36).substring(2, 12);

      let successCount = 0;
      let failureCount = 0;

      // Submit each platform sequentially to show real-time progress
      for (const config of enabledPlatforms) {
        // Update status to 'submitting'
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

          const body: Record<string, unknown> = {
            category: config.category,
            credential: config.credentialId,
            description: config.description,
            groupId, // Add groupId to link all posts in this batch
            ingredients: activeIngredients.map((ing: IIngredient) => ing.id),
            isRepeat: false,
            isShareToFeedSelected: config.isShareToFeedSelected,
            label: config.label,
            scheduledDate,
            status: config.status,
          };

          await service.post(body);

          // Update status to 'completed'
          setPlatformStatuses((prev) =>
            prev.map((status) =>
              status.credentialId === config.credentialId
                ? { ...status, status: 'completed' as const }
                : status,
            ),
          );

          successCount++;
        } catch (error) {
          const errorDetails = ErrorHandler.extractErrorDetails(error);

          // Update status to 'failed'
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

      // Show final notification
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
    } catch (error) {
      logger.error(`${url} failed`, error);

      const errorDetails = ErrorHandler.extractErrorDetails(error);

      let errorMessage =
        errorDetails.message || 'Failed to schedule publication';

      if (
        errorDetails.validationErrors &&
        errorDetails.validationErrors.length > 0
      ) {
        const validationMessages = errorDetails.validationErrors
          .map((err) => `${err.field}: ${err.message}`)
          .join(', ');
        errorMessage = `Validation failed: ${validationMessages}`;
      }

      setError(errorMessage);
    }
  }, [
    activeIngredients,
    credentials,
    getPostsService,
    globalScheduledDate,
    notificationsService,
    platformConfigs,
    isCredentialValid,
  ]);

  const formRef = useFocusFirstInput<HTMLFormElement>();
  const submitHandler = useCallback(async () => {
    await form.handleSubmit(handleSubmit)();
  }, [form, handleSubmit]);

  const { isSubmitting, onSubmit } = useFormSubmitWithState(submitHandler);

  // Initialize platform configs with all possible platforms
  useEffect(() => {
    // Only initialize if we have an ingredient
    if (!ingredient) {
      startTransition(() => {
        setPlatformConfigs([]);
        setGlobalScheduledDate(null);
      });

      return;
    }

    const isImage = ingredient.category === IngredientCategory.IMAGE;
    const isGif = ingredient.category === IngredientCategory.GIF;
    const allPlatforms = [
      CredentialPlatform.YOUTUBE,
      CredentialPlatform.TIKTOK,
      CredentialPlatform.INSTAGRAM,
      CredentialPlatform.TWITTER,
    ];

    // Filter platforms based on content type
    let availablePlatforms: CredentialPlatform[];
    if (isGif) {
      // GIFs can only be published to Twitter/X
      availablePlatforms = [CredentialPlatform.TWITTER];
    } else if (isImage) {
      // Images: Filter out YouTube and TikTok
      availablePlatforms = allPlatforms.filter(
        (platform) =>
          platform !== CredentialPlatform.YOUTUBE &&
          platform !== CredentialPlatform.TIKTOK,
      );
    } else {
      availablePlatforms = allPlatforms;
    }

    const configs: IPostPlatformConfig[] = availablePlatforms.map(
      (platform) => {
        const credential =
          credentials?.find((c) => c.platform === platform) ?? null;
        const credentialValid = isCredentialValid(credential ?? undefined);

        return {
          credentialId: credential?.id ?? '',
          customScheduledDate: '',
          description: '',
          enabled: Boolean(credential && credentialValid),
          handle: credential?.externalHandle ?? '',
          isCredentialValid: credential ? credentialValid : undefined,
          label: '',
          overrideSchedule: false,
          platform,
          status:
            platform === CredentialPlatform.YOUTUBE ? 'unlisted' : 'scheduled',
        };
      },
    );

    startTransition(() => {
      setPlatformConfigs(configs);
      form.setValue('platforms', configs);
      if (!hasInitializedDate.current) {
        setGlobalScheduledDate(getMinDateTime());
        hasInitializedDate.current = true;
      }
    });
  }, [form, getMinDateTime, ingredient, credentials, isCredentialValid]);

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

  // Initialize platform configs with all possible platforms
  useEffect(() => {
    // Only initialize if we have ingredients
    if (!activeIngredients || activeIngredients.length === 0) {
      startTransition(() => {
        setPlatformConfigs([]);
        setGlobalScheduledDate(null);
      });
      return;
    }

    // Mark credentials as loaded once this effect runs
    // This helps detect when credentials have been initialized from the brand context
    // Note: credentials always exists as an array (starts as []), so we track when effect runs
    credentialsLoadedRef.current = true;

    // Use first ingredient to determine content type
    const firstIngredient = activeIngredients[0];
    const isImage = firstIngredient.category === IngredientCategory.IMAGE;

    // Get available platforms based on content type and carousel mode
    const availablePlatforms = getAvailablePlatforms(
      firstIngredient.category,
      isCarousel,
    );

    const configs: IPostPlatformConfig[] = availablePlatforms.map(
      (platform) => {
        const credential =
          credentials?.find((c) => c.platform === platform) ?? null;
        const credentialValid = isCredentialValid(credential ?? undefined);

        // Determine default category for Instagram based on ingredient type
        let defaultCategory: PostCategory | undefined;
        if (platform === CredentialPlatform.INSTAGRAM) {
          if (isImage) {
            defaultCategory = PostCategory.IMAGE;
          } else {
            // For videos, use VIDEO category (Instagram publishes all videos as Reels internally)
            defaultCategory = PostCategory.VIDEO;
          }
        }

        return {
          category: defaultCategory,
          credentialId: credential?.id ?? '',
          customScheduledDate: '',
          description: '',
          enabled: Boolean(credential && credentialValid),
          handle: credential?.externalHandle ?? '',
          isCredentialValid: credential ? credentialValid : undefined,
          isShareToFeedSelected: false,
          label: '',
          overrideSchedule: false,
          platform,
          status:
            platform === CredentialPlatform.YOUTUBE ? 'unlisted' : 'scheduled',
        };
      },
    );

    startTransition(() => {
      setPlatformConfigs(configs);
      form.setValue('platforms', configs);
      if (!hasInitializedDate.current && !globalScheduledDate) {
        setGlobalScheduledDate(getMinDateTime());
        hasInitializedDate.current = true;
      }
    });
  }, [
    credentials,
    form,
    getMinDateTime,
    globalScheduledDate,
    activeIngredients,
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

    // Find credentials that are connected but have expired tokens
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

    // Update platform configs with global values only if they don't have custom values
    setPlatformConfigs((prev) =>
      prev.map((config) => ({
        ...config,
        // Only set description if it's empty or if it matches the previous global value
        description: config.description || globalDesc || '',
        // Only set label if it's empty or if it matches the previous global value
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
    // Only allow changing to platforms tab if step 1 is complete
    if (tab === 'platforms' && !isStep1Complete) {
      return;
    }
    setActiveTab(tab);
  };

  const togglePlatform = (credentialId: string) => {
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

  const updatePlatformConfig = (
    credentialId: string,
    updates: Partial<IPostPlatformConfig>,
  ) => {
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

  // Check if there are any credentials available for the platforms that support this content type
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

  // Validate all enabled platforms have required fields filled
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

  // Calculate aspect ratio for video/image display
  const getAspectRatioInfo = () => {
    if (!ingredient) {
      return { height: 1920, isPortrait: false, width: 1920 };
    }

    // Try to get dimensions from metadata object first
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

  // Only use fullscreen for setup/platforms tabs, not results
  const shouldBeFullScreen =
    !!ingredient &&
    credentials &&
    credentials?.length > 0 &&
    hasAvailableCredentials &&
    activeTab !== 'results';

  return (
    <Modal
      id={ModalEnum.POST_BATCH}
      error={error}
      onClose={() => setError(null)}
      isFullScreen={shouldBeFullScreen}
    >
      <div className="h-full flex flex-col overflow-hidden">
        <ModalPostBatchEmptyState
          ingredient={ingredient}
          credentials={credentials}
          hasAvailableCredentials={hasAvailableCredentials}
          hasInvalidCredentials={hasInvalidCredentials}
          onClose={closeModalPost}
          onOpenCredentials={openCredentials}
        />

        {ingredient &&
        credentials &&
        credentials?.length > 0 &&
        hasAvailableCredentials ? (
          <div className="flex gap-6 h-full overflow-hidden">
            {/* Left side - Ingredient preview (hidden on results tab) */}
            {ingredient && activeTab !== 'results' && (
              <ModalPostBatchIngredientPreview
                ingredient={ingredient}
                aspectRatioInfo={aspectRatioInfo}
              />
            )}

            {/* Right side - Form or Results */}
            <div className="flex-1 h-full overflow-y-auto flex flex-col">
              {activeTab === 'results' ? (
                <ModalPostBatchResultsView
                  platformStatuses={platformStatuses}
                  onClose={closeModalPost}
                />
              ) : (
                // Form View
                <form
                  ref={formRef}
                  onSubmit={onSubmit}
                  className="h-full flex flex-col"
                >
                  <ModalPostBatchFormAlerts
                    formErrors={form.formState.errors}
                    invalidCredentialConfigs={invalidCredentialConfigs}
                    invalidCredentialSummary={invalidCredentialSummary}
                    onManageConnections={() => {
                      closeModalPost();
                      push(`${EnvironmentService.apps.app}/credentials`);
                    }}
                  />

                  <ModalPostHeader
                    activeTab={activeTab}
                    onTabChange={handleTabChange}
                    isStep1Complete={isStep1Complete}
                  />

                  <div className="flex-1 overflow-y-auto p-2">
                    <ModalPostContent
                      activeTab={activeTab}
                      form={form}
                      platformConfigs={platformConfigs}
                      globalScheduledDate={globalScheduledDate}
                      setGlobalScheduledDate={setGlobalScheduledDate}
                      settings={settings}
                      ingredient={ingredient}
                      isLoading={isSubmitting}
                      togglePlatform={togglePlatform}
                      updatePlatformConfig={updatePlatformConfig}
                      getMinDateTime={getMinDateTime}
                    />
                  </div>

                  <ModalPostFooter
                    activeTab={activeTab}
                    isLoading={isSubmitting}
                    enabledCount={enabledCount}
                    globalScheduledDate={globalScheduledDate}
                    globalDescription={globalDescription ?? ''}
                    hasYoutube={hasYoutube}
                    globalLabel={globalLabel ?? ''}
                    onNextStep={handleNextStep}
                    onPreviousStep={handlePreviousStep}
                    onClose={closeModalPost}
                    isFormValid={isFormValid}
                  />
                </form>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </Modal>
  );
}
