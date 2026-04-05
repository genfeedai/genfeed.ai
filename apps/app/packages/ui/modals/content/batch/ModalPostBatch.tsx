import type {
  ICredential,
  IIngredient,
  IMetadata,
  IOrganizationSetting,
  IPostPlatformConfig,
} from '@genfeedai/interfaces';
import type { PlatformSubmissionStatus } from '@genfeedai/interfaces/modals/platform-submission-status.interface';
import { useBrand } from '@contexts/user/brand-context/brand-context';
import {
  type MultiPostSchema,
  multiPostSchema,
} from '@genfeedai/client/schemas';
import {
  AlertCategory,
  ButtonVariant,
  ComponentSize,
  CredentialPlatform,
  IngredientCategory,
  ModalEnum,
  PostCategory,
  PostStatus,
} from '@genfeedai/enums';
import { getPublisherPostsHref } from '@helpers/content/posts.helper';
import { cn } from '@helpers/formatting/cn/cn.util';
import {
  hasFormErrors,
  parseFormErrors,
} from '@helpers/ui/form-error/form-error.helper';
import { closeModal } from '@helpers/ui/modal/modal.helper';
import { standardSchemaResolver } from '@hookform/resolvers/standard-schema';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useFocusFirstInput } from '@hooks/ui/use-focus-first-input/use-focus-first-input';
import { useModalAutoOpen } from '@hooks/ui/use-modal-auto-open/use-modal-auto-open';
import { useFormSubmitWithState } from '@hooks/utils/use-form-submit/use-form-submit';
import type { ModalPostProps } from '@props/modals/modal.props';
import { PostsService } from '@services/content/posts.service';
import { EnvironmentService } from '@services/core/environment.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { CredentialsService } from '@services/organization/credentials.service';
import { OrganizationsService } from '@services/organization/organizations.service';
import Button from '@ui/buttons/base/Button';
import Badge from '@ui/display/badge/Badge';
import VideoPlayer from '@ui/display/video-player/VideoPlayer';
import Alert from '@ui/feedback/alert/Alert';
import ModalPostContent from '@ui/modals/content/post/ModalPostContent';
import ModalPostFooter from '@ui/modals/content/post/ModalPostFooter';
import ModalPostHeader from '@ui/modals/content/post/ModalPostHeader';
import Modal from '@ui/modals/modal/Modal';
import { ErrorHandler } from '@utils/error/error-handler.util';
import Image from 'next/image';
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
import { FaInstagram, FaTiktok, FaXTwitter, FaYoutube } from 'react-icons/fa6';

const SCHEDULER_ALLOWED_MINUTES: readonly number[] = [0, 15, 30, 45];

// Platform icon mapping
const PLATFORM_ICONS = {
  [CredentialPlatform.YOUTUBE]: FaYoutube,
  [CredentialPlatform.INSTAGRAM]: FaInstagram,
  [CredentialPlatform.TWITTER]: FaXTwitter,
  [CredentialPlatform.TIKTOK]: FaTiktok,
};

type ModalPostBatchEmptyStateProps = {
  ingredient: ModalPostProps['ingredient'];
  credentials: ModalPostProps['credentials'];
  hasAvailableCredentials: boolean;
  hasInvalidCredentials: boolean;
  onClose: () => void;
  router: ReturnType<typeof useRouter>;
};

// All supported platforms
const ALL_PLATFORMS = [
  CredentialPlatform.YOUTUBE,
  CredentialPlatform.TIKTOK,
  CredentialPlatform.INSTAGRAM,
  CredentialPlatform.TWITTER,
];

// Get available platforms based on content type and carousel mode
function getAvailablePlatforms(
  category: IngredientCategory,
  isCarousel: boolean,
): CredentialPlatform[] {
  // GIFs only supported on Twitter/X
  if (category === IngredientCategory.GIF) {
    return [CredentialPlatform.TWITTER];
  }

  // Images
  if (category === IngredientCategory.IMAGE) {
    if (isCarousel) {
      return [
        CredentialPlatform.INSTAGRAM,
        CredentialPlatform.TWITTER,
        CredentialPlatform.TIKTOK,
      ];
    }
    return [CredentialPlatform.INSTAGRAM, CredentialPlatform.TWITTER];
  }

  // Videos - YouTube doesn't support carousels
  if (isCarousel) {
    return ALL_PLATFORMS.filter((p) => p !== CredentialPlatform.YOUTUBE);
  }
  return ALL_PLATFORMS;
}

function getCredentialErrorMessage(category: IngredientCategory): string {
  switch (category) {
    case IngredientCategory.IMAGE:
      return 'No credentials available for images. Please connect Instagram or Twitter/X to publish images.';
    case IngredientCategory.GIF:
      return 'No credentials available for GIFs. Please connect Twitter/X to publish GIFs.';
    default:
      return 'No credentials available for this content. Please connect a compatible platform.';
  }
}

function ModalPostBatchEmptyState({
  ingredient,
  credentials,
  hasAvailableCredentials,
  hasInvalidCredentials,
  onClose,
  router,
}: ModalPostBatchEmptyStateProps) {
  if (!ingredient) {
    return (
      <div className="text-center py-8 px-4">
        <h3 className="text-lg font-bold mb-4">No Content Selected</h3>
        <p className="text-foreground/70 mb-6">
          Please select content to publish.
        </p>

        <Button
          label="Close"
          variant={ButtonVariant.SECONDARY}
          onClick={onClose}
        />
      </div>
    );
  }

  if (credentials?.length === 0 || !hasAvailableCredentials) {
    const title = hasInvalidCredentials
      ? 'Reconnect Accounts'
      : 'No Credentials Available';
    const errorMessage =
      credentials?.length === 0
        ? 'Please connect your social media accounts first to publish content.'
        : hasInvalidCredentials
          ? 'Your connected accounts need to be reconnected before publishing.'
          : getCredentialErrorMessage(ingredient.category);
    const actionLabel = hasInvalidCredentials
      ? 'Reconnect Account'
      : 'Connect Account';

    return (
      <div className="text-center py-8 px-4">
        <h3 className="text-lg font-bold mb-4">{title}</h3>
        <p className="text-foreground/70 mb-6">{errorMessage}</p>

        <div className="flex gap-3 justify-center">
          <Button
            label="Close"
            variant={ButtonVariant.SECONDARY}
            onClick={onClose}
          />

          <Button
            label={actionLabel}
            variant={ButtonVariant.DEFAULT}
            onClick={() => {
              onClose();
              router.push(`${EnvironmentService.apps.app}/credentials`);
            }}
          />
        </div>
      </div>
    );
  }

  return null;
}

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
  const router = useRouter();
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
      if (!credential || !credential.isConnected) {
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
      !SCHEDULER_ALLOWED_MINUTES.includes(nextAllowed.getMinutes())
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

      const url = `GET /organizations/${organizationId}`;

      try {
        const service = await getOrganizationsService();
        const organization = await service.findOne(organizationId);

        if (signal?.aborted) {
          return;
        }

        if (organization?.settings) {
          setSettings(organization.settings);
        }

        logger.info(`${url} success`, organization);
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
              : globalScheduledDate!;

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
    let availablePlatforms;
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

    if (organizationId) {
      startTransition(() => {
        void findOrganizationSettings(abortController.signal);
      });
    }

    return () => {
      abortController.abort();
    };
  }, [findOrganizationSettings, organizationId]);

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
          router={router}
        />

        {ingredient &&
        credentials &&
        credentials?.length > 0 &&
        hasAvailableCredentials ? (
          <div className="flex gap-6 h-full overflow-hidden">
            {/* Left side - Ingredient preview (hidden on results tab) */}
            {ingredient && activeTab !== 'results' && (
              <div className="w-1/3 flex-shrink-0 max-h-full overflow-y-auto pr-2">
                <div className="sticky top-0 space-y-3">
                  <div
                    className={cn(
                      'relative overflow-hidden shadow-lg flex items-center justify-center mx-auto w-fit',
                      // Smart width constraints based on aspect ratio
                      aspectRatioInfo.isPortrait ? 'max-w-2xl' : 'max-w-4xl',
                    )}
                    style={{
                      aspectRatio: `${aspectRatioInfo.width} / ${aspectRatioInfo.height}`,
                      maxHeight: '60vh',
                    }}
                  >
                    {ingredient.category === IngredientCategory.VIDEO ? (
                      ingredient.ingredientUrl ? (
                        <VideoPlayer
                          src={ingredient.ingredientUrl}
                          thumbnail={ingredient?.thumbnailUrl ?? undefined}
                          config={{
                            autoPlay: false,
                            controls: true,
                            loop: false,
                            muted: true,
                            playsInline: true,
                            preload: 'metadata',
                          }}
                        />
                      ) : (
                        <div className="aspect-video w-full bg-background/70 flex items-center justify-center text-foreground/60">
                          Video preview unavailable.
                        </div>
                      )
                    ) : (
                      <Image
                        src={
                          ingredient.ingredientUrl ||
                          `${EnvironmentService.assetsEndpoint}/placeholders/portrait.jpg`
                        }
                        alt={ingredient.metadataLabel || 'Ingredient'}
                        width={aspectRatioInfo.width}
                        height={aspectRatioInfo.height}
                        className="h-auto object-contain"
                        sizes="(max-width: 768px) 100vw, 33vw"
                        style={{
                          aspectRatio: `${aspectRatioInfo.width} / ${aspectRatioInfo.height}`,
                          maxHeight: '60vh',
                          width: 'auto',
                        }}
                      />
                    )}
                  </div>
                  <div className="space-y-2">
                    <h4 className="font-semibold text-sm truncate max-w-full">
                      {ingredient.metadataLabel || 'Untitled'}
                    </h4>

                    {ingredient.metadataDescription && (
                      <p className="text-xs text-foreground/70 line-clamp-2">
                        {ingredient.metadataDescription}
                      </p>
                    )}

                    <div className="flex flex-wrap gap-2">
                      <Badge size={ComponentSize.SM}>
                        {ingredient.category}
                      </Badge>
                      {ingredient.ingredientFormat && (
                        <Badge size={ComponentSize.SM}>
                          {ingredient.ingredientFormat}
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Right side - Form or Results */}
            <div className="flex-1 h-full overflow-y-auto flex flex-col">
              {activeTab === 'results' ? (
                // Results View - Real-time status tracking
                <div className="h-full flex flex-col items-center justify-center p-6">
                  <div className="w-full max-w-md space-y-6">
                    {/* Header */}
                    <div className="text-center">
                      <h2 className="text-2xl font-bold mb-2">
                        Submission Status
                      </h2>

                      <p className="text-foreground/70">
                        {
                          platformStatuses.filter(
                            (r) => r.status === 'completed',
                          ).length
                        }{' '}
                        of {platformStatuses.length} platform
                        {platformStatuses.length !== 1 ? 's' : ''} scheduled
                        {platformStatuses.some(
                          (r) =>
                            r.status === 'pending' || r.status === 'submitting',
                        )
                          ? ' (in progress...)'
                          : ' successfully'}
                      </p>
                    </div>

                    {/* Platform statuses */}
                    <div className="space-y-2">
                      {platformStatuses.map((status, index) => {
                        const PlatformIcon =
                          PLATFORM_ICONS[
                            status.platform as keyof typeof PLATFORM_ICONS
                          ];

                        const getStatusColor = () => {
                          switch (status.status) {
                            case 'completed':
                              return 'bg-success/10 border-success/20';
                            case 'failed':
                              return 'bg-error/10 border-error/20';
                            case 'submitting':
                              return 'bg-info/10 border-info/20';
                            default:
                              return 'bg-background/50 border-white/[0.08]';
                          }
                        };

                        const getIconColor = () => {
                          switch (status.status) {
                            case 'completed':
                              return 'text-success';
                            case 'failed':
                              return 'text-error';
                            case 'submitting':
                              return 'text-info';
                            default:
                              return 'text-foreground/40';
                          }
                        };

                        const getStatusBadge = () => {
                          switch (status.status) {
                            case 'completed':
                              return <Badge status="success">Completed</Badge>;
                            case 'failed':
                              return <Badge status="error">Failed</Badge>;
                            case 'submitting':
                              return <Badge status="info">Submitting...</Badge>;
                            default:
                              return <Badge variant="ghost">Pending</Badge>;
                          }
                        };

                        return (
                          <div
                            key={index}
                            className={`flex items-center gap-3 p-4 border transition-all ${getStatusColor()}`}
                          >
                            {PlatformIcon && (
                              <PlatformIcon
                                className={`h-5 w-5 ${getIconColor()}`}
                              />
                            )}
                            <div className="flex-1">
                              {status.handle && (
                                <p className="text-sm text-foreground/60">
                                  @{status.handle}
                                </p>
                              )}
                              {status.error && (
                                <p className="text-sm text-error mt-1">
                                  {status.error}
                                </p>
                              )}
                            </div>
                            {getStatusBadge()}
                          </div>
                        );
                      })}
                    </div>

                    {/* Final confirmation - only show when all submissions complete */}
                    {platformStatuses.length > 0 &&
                      platformStatuses.every(
                        (s) =>
                          s.status === 'completed' || s.status === 'failed',
                      ) && (
                        <div className="w-full space-y-4 pt-4 border-t border-white/[0.08]">
                          <Alert
                            type={AlertCategory.SUCCESS}
                            className="w-full"
                          >
                            <div className="space-y-1">
                              <p className="font-semibold">
                                All posts have been created
                              </p>
                              <p className="text-sm opacity-80">
                                {
                                  platformStatuses.filter(
                                    (s) => s.status === 'completed',
                                  ).length
                                }{' '}
                                post
                                {platformStatuses.filter(
                                  (s) => s.status === 'completed',
                                ).length !== 1
                                  ? 's'
                                  : ''}{' '}
                                waiting to be processed and will be published at
                                the scheduled time.
                              </p>
                            </div>
                          </Alert>

                          <div className="flex w-full gap-2 justify-between">
                            <Button
                              label="Close"
                              variant={ButtonVariant.GHOST}
                              onClick={closeModalPost}
                            />

                            <Button
                              label="View Scheduled Posts"
                              variant={ButtonVariant.DEFAULT}
                              onClick={() => {
                                router.push(
                                  `${EnvironmentService.apps.app}${getPublisherPostsHref(
                                    {
                                      status: PostStatus.SCHEDULED,
                                    },
                                  )}`,
                                );
                              }}
                            />
                          </div>
                        </div>
                      )}
                  </div>
                </div>
              ) : (
                // Form View
                <form
                  ref={formRef}
                  onSubmit={onSubmit}
                  className="h-full flex flex-col"
                >
                  {hasFormErrors(form.formState.errors) && (
                    <Alert type={AlertCategory.ERROR} className="mb-4">
                      <div className="space-y-1">
                        {parseFormErrors(form.formState.errors).map(
                          (error, index) => (
                            <div key={index}>{error}</div>
                          ),
                        )}
                      </div>
                    </Alert>
                  )}

                  {invalidCredentialConfigs.length > 0 && (
                    <Alert type={AlertCategory.WARNING} className="mb-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="space-y-1">
                          <div className="font-medium">
                            Some accounts need to be reconnected.
                          </div>
                          <div className="text-xs text-foreground/70">
                            {invalidCredentialSummary
                              ? `Reconnect ${invalidCredentialSummary} to publish on those platforms.`
                              : 'Reconnect your social accounts to enable publishing.'}
                          </div>
                        </div>
                        <Button
                          label="Manage Connections"
                          variant={ButtonVariant.OUTLINE}
                          onClick={() => {
                            closeModalPost();
                            router.push(
                              `${EnvironmentService.apps.app}/credentials`,
                            );
                          }}
                        />
                      </div>
                    </Alert>
                  )}

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
