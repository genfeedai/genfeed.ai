import {
  type PostModalSchema,
  postModalSchema,
} from '@genfeedai/client/schemas';
import {
  useGalleryModal,
  useUploadModal,
} from '@genfeedai/contexts/providers/global-modals/global-modals.hooks';
import { useBrand } from '@genfeedai/contexts/user/brand-context/brand-context';
import {
  formatPlatformLabel,
  IngredientCategory,
  isOrganicPostingPlatform,
  ModalEnum,
  Platform,
  PostFormat,
  PostVisibility,
  TargetExecutionState,
} from '@genfeedai/contracts';
import type { IIngredient, IPost } from '@genfeedai/contracts/interfaces';
import { getBrowserTimezone } from '@genfeedai/helpers/formatting/timezone/timezone.helper';
import { openModal } from '@genfeedai/helpers/ui/modal/modal.helper';
import { useAuthedService } from '@genfeedai/hooks/auth/use-authed-service/use-authed-service';
import type {
  ComposerDestination,
  ModalPostComposerStep,
  ModalPostMediaKind,
  ModalPostProps,
} from '@genfeedai/props/modals/modal.props';
import { PostsService } from '@genfeedai/services/content/posts.service';
import { ReleaseGroupsService } from '@genfeedai/services/content/release-groups.service';
import { logger } from '@genfeedai/services/core/logger.service';
import { NotificationsService } from '@genfeedai/services/core/notifications.service';
import { splitTextIntoThread } from '@helpers/formatting/thread-split/thread-split.helper';
import { calculateTweetLength } from '@helpers/formatting/tweet-length/tweet-length.helper';
import { stripHtmlToPlainText } from '@helpers/security/strip-html.helper';
import Modal from '@ui/modals/modal/Modal';
import { Form } from '@ui/primitives/form';
import { resolvePlatformCharLimit } from '@ui-constants/platform-char-limit.constant';
import { useTranslations } from 'next-intl';
import {
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useCrudModal } from '@/hooks/ui/use-crud-modal/use-crud-modal';
import { useModalAutoOpen } from '@/hooks/ui/use-modal-auto-open/use-modal-auto-open';
import { defaultComposerCredentialIds } from './genfeed-profile-default.helper';
import ModalPostComposerStepper from './ModalPostComposerStepper';
import ModalPostSimpleActions from './ModalPostSimpleActions';
import ModalPostSimpleFields from './ModalPostSimpleFields';
import ModalPostSimpleHeader from './ModalPostSimpleHeader';
import {
  getPostCategoryForMedia,
  getPostMediaRequirement,
  getUnmetPostMediaRequirements,
  isPostMediaRequirementMet,
  mergePostMedia,
} from './post-media.helper';

const EMPTY_ARRAY: never[] = [];

/** How a new post leaves the modal; the lifecycle follows from it, never from a field. */
type PostSubmitIntent = 'draft' | 'publish' | 'schedule';

/** X accepts up to 280 characters per post; longer text publishes as long-form. */
const X_STANDARD_POST_LIMIT = 280;

function isXPlatform(platform: string | undefined | null): boolean {
  return platform === Platform.TWITTER;
}

export default function ModalPost({
  post,
  ingredient,
  modalId,
  credential,
  credentials: allCredentials = EMPTY_ARRAY,
  parentPost,
  defaultPlatform,
  isComposer = false,
  onConfirm,
  onClose,
  onCreated,
  showViewDetailsButton = false,
  onViewDetails,
}: ModalPostProps) {
  const credentials = useMemo(
    () =>
      allCredentials.filter((account) =>
        isOrganicPostingPlatform(account.platform),
      ),
    [allCredentials],
  );
  const { brandId, selectedBrand } = useBrand();
  const notificationsService = NotificationsService.getInstance();
  const composerTranslate = useTranslations('ui.postComposer');

  // Get browser timezone for consistent date display
  const browserTimezone = useMemo(() => getBrowserTimezone(), []);

  const [openVersion, setOpenVersion] = useState(0);
  const isEditMode = Boolean(post);
  const isThreadReply = Boolean(parentPost);
  const isDestinationComposer = isComposer && !isEditMode && !isThreadReply;

  // Destination-first composer state. Accounts are multi-select; Article and
  // Newsletter are exclusive with them because they hand off to their editors.
  const [selectedCredentialIds, setSelectedCredentialIds] = useState<string[]>(
    [],
  );
  const [destination, setDestination] = useState<ComposerDestination | null>(
    null,
  );
  const [isThread, setIsThread] = useState(false);
  // Where it goes first, then what it says.
  const [composerStep, setComposerStep] =
    useState<ModalPostComposerStep>('channels');
  // Library media attached to a new post, in posting order. The form keeps the
  // ids; this keeps what the preview and the delivery checks need.
  const [selectedMedia, setSelectedMedia] = useState<IIngredient[]>(() =>
    ingredient ? [ingredient] : [],
  );
  const selectedMediaRef = useRef(selectedMedia);
  selectedMediaRef.current = selectedMedia;
  // A Library asset that opened the composer is attached again after a reset.
  const initialMedia = useMemo(
    () => (ingredient ? [ingredient] : []),
    [ingredient],
  );
  const initialMediaRef = useRef(initialMedia);
  initialMediaRef.current = initialMedia;
  const { openGallery } = useGalleryModal();
  const { openUpload } = useUploadModal();
  const selectedCredentials = useMemo(
    () =>
      credentials.filter((account) =>
        selectedCredentialIds.includes(account.id),
      ),
    [credentials, selectedCredentialIds],
  );
  const selectedCredentialsRef = useRef(selectedCredentials);
  selectedCredentialsRef.current = selectedCredentials;
  // A new post starts on the brand's Genfeed profile once per opening.
  const defaultChannelsOpenVersionRef = useRef<number | null>(null);
  const brandScope = selectedBrand?.scope;
  useEffect(() => {
    if (
      !isDestinationComposer ||
      defaultChannelsOpenVersionRef.current === openVersion
    ) {
      return;
    }
    const defaultIds = defaultComposerCredentialIds(credentials, brandScope);
    if (defaultIds.length === 0) {
      return;
    }
    defaultChannelsOpenVersionRef.current = openVersion;
    setSelectedCredentialIds((current) =>
      current.length > 0 ? current : defaultIds,
    );
  }, [brandScope, credentials, isDestinationComposer, openVersion]);
  const isThreadRef = useRef(isThread);
  isThreadRef.current = isThread;

  // Refs for callbacks to prevent re-renders
  const onConfirmRef = useRef(onConfirm);
  onConfirmRef.current = onConfirm;
  const onViewDetailsRef = useRef(onViewDetails);
  onViewDetailsRef.current = onViewDetails;
  const onCreatedRef = useRef(onCreated);
  onCreatedRef.current = onCreated;

  // Stable callback for useCrudModal
  const stableOnConfirm = useCallback(() => {
    onConfirmRef.current?.();
  }, []);

  // Stabilize defaultValues to prevent unnecessary re-renders
  const _defaultValuesKey = `${credential?.id}-${ingredient?.id}-${parentPost?.id}`;
  const defaultValues = useMemo(
    () => ({
      credentialId: isDestinationComposer
        ? ''
        : credential?.id || credentials[0]?.id || '',
      description: '',
      format: PostFormat.STANDARD,
      ingredients: ingredient ? [ingredient.id] : [],
      label: '',
      parentId: parentPost?.id || '',
      platform: isDestinationComposer
        ? Platform.TWITTER
        : (defaultPlatform ??
          credential?.platform ??
          credentials[0]?.platform ??
          Platform.TWITTER),
      scheduledDate: '',
      targetExecutionState: TargetExecutionState.DRAFT,
      visibility: PostVisibility.PUBLIC,
    }),
    [
      credential?.id,
      credential?.platform,
      credentials,
      ingredient,
      isDestinationComposer,
      parentPost?.id,
      defaultPlatform,
    ],
  );
  const defaultValuesRef = useRef(defaultValues);
  defaultValuesRef.current = defaultValues;

  // The generated draft already exists as a receipt-bound DRAFT post; submitting
  // updates it instead of creating a second post.
  const adoptedDraftRef = useRef<{ platform: string; postId: string } | null>(
    null,
  );
  const submitIntentRef = useRef<PostSubmitIntent>('draft');
  const isIntentArmedRef = useRef(false);
  const getReleaseGroupsService = useAuthedService(
    useCallback((token: string) => ReleaseGroupsService.getInstance(token), []),
  );

  const publishCreatedNow = useCallback(
    async (postIds: string[]) => {
      const releases = await getReleaseGroupsService();
      await Promise.all(
        postIds.map(async (postId) => {
          const release = await releases.ensureFromPost(postId);
          await releases.publishTargetNow(release.id, postId);
        }),
      );
    },
    [getReleaseGroupsService],
  );

  // The post is already saved as a draft when publishing fails, so the modal
  // closes with a clear message instead of inviting a duplicate submit.
  const publishNowOrKeepDraft = useCallback(
    async (postIds: string[]) => {
      try {
        await publishCreatedNow(postIds);
        notificationsService.success('Publishing now');
      } catch (error) {
        logger.error('Failed to publish a new post now', error);
        notificationsService.error(
          'Saved as a draft, but publishing failed. Publish it from the post page.',
        );
      }
    },
    [notificationsService, publishCreatedNow],
  );

  const customSubmitHandler = useCallback(
    async (
      service: unknown,
      entity: typeof post,
      submitted: PostModalSchema,
    ) => {
      const postsService = service as PostsService;
      const intent = submitIntentRef.current;
      submitIntentRef.current = 'draft';
      // A new post is a draft, a schedule or an immediate publish. Publishing
      // starts from a saved draft, so only a schedule carries a lifecycle.
      const formData: PostModalSchema = isEditMode
        ? submitted
        : {
            ...submitted,
            scheduledDate: intent === 'schedule' ? submitted.scheduledDate : '',
            targetExecutionState:
              intent === 'schedule'
                ? TargetExecutionState.SCHEDULED
                : TargetExecutionState.DRAFT,
          };

      const selectedCredential = credentials.find(
        (c) => c.id === formData.credentialId,
      );
      const targetPlatform =
        selectedCredential?.platform ||
        entity?.platform ||
        entity?.credential?.platform ||
        formData.platform;

      const isScheduling =
        formData.targetExecutionState === TargetExecutionState.SCHEDULED;
      if (isScheduling && !formData.scheduledDate) {
        notificationsService.error(
          'Choose a scheduled date before scheduling this post',
        );
        throw new Error('Scheduled date required for scheduled posts');
      }

      const composerTargets = selectedCredentialsRef.current;
      const platformsToCheck =
        isDestinationComposer && composerTargets.length > 0
          ? composerTargets.map((target) => target.platform)
          : [targetPlatform];

      // Delivering (now or later) needs the media each destination demands; a
      // draft never does. The post stays as the user left it when this fails.
      if (isScheduling || intent === 'publish') {
        const requirement = getPostMediaRequirement(
          platformsToCheck.filter((platform): platform is Platform =>
            Boolean(platform),
          ),
        );
        const hasMedia = (formData.ingredients ?? []).length > 0;
        const hasVideo = isPostMediaRequirementMet(
          'video',
          selectedMediaRef.current,
        );
        if (requirement !== 'none' && !hasMedia) {
          notificationsService.error(
            composerTranslate(
              requirement === 'video' ? 'videoRequired' : 'mediaRequired',
            ),
          );
          throw new Error('Media required to publish or schedule this post');
        }
        if (requirement === 'video' && !isEditMode && !hasVideo) {
          notificationsService.error(composerTranslate('videoRequired'));
          throw new Error('Video required to publish or schedule this post');
        }
      }

      // X carries no formatting, so its description is always plain text; the
      // other platforms edit through a rich-text editor and keep their HTML.
      const descriptionForSubmit =
        targetPlatform === Platform.TWITTER
          ? stripHtmlToPlainText(formData.description)
          : formData.description;

      if (isDestinationComposer) {
        // One post per selected account. Unselected means a draft on the
        // default channel. X derives its format from length, or splits into
        // a thread when the toggle is on.
        const targets = composerTargets.length > 0 ? composerTargets : [null];
        const label = formData.label?.trim() || '';
        const results = await Promise.allSettled(
          targets.map(async (target) => {
            const platform = target?.platform ?? formData.platform;
            const isX = isXPlatform(platform);
            const caption = isX
              ? stripHtmlToPlainText(formData.description)
              : formData.description;
            const category = getPostCategoryForMedia(selectedMediaRef.current);
            const shared = {
              brandId: brandId || undefined,
              credentialId: target?.id,
              platform,
              ...(formData.scheduledDate
                ? { scheduledDate: formData.scheduledDate }
                : {}),
              targetExecutionState: formData.targetExecutionState,
              visibility: formData.visibility,
            };

            if (isX && isThreadRef.current) {
              const parts = splitTextIntoThread(caption);
              const thread = await postsService.createThread({
                posts: parts.map((part, index) => ({
                  ...shared,
                  ...(index === 0 && category ? { category } : {}),
                  description: part,
                  ingredients: index === 0 ? formData.ingredients || [] : [],
                  label: label || `Thread ${index + 1}/${parts.length}`,
                })),
              });
              return thread[0];
            }

            return postsService.post({
              ...shared,
              ...(category ? { category } : {}),
              description: caption,
              format:
                isX && calculateTweetLength(caption) > X_STANDARD_POST_LIMIT
                  ? PostFormat.LONG_FORM
                  : PostFormat.STANDARD,
              ingredients: formData.ingredients || [],
              label,
            });
          }),
        );

        const created = results.flatMap((result) =>
          result.status === 'fulfilled' && result.value ? [result.value] : [],
        );
        const failedCount = results.length - created.length;

        if (created.length === 0) {
          notificationsService.error('Failed to create post');
          const failure = results.find(
            (result) => result.status === 'rejected',
          );
          throw failure?.status === 'rejected'
            ? failure.reason
            : new Error('Failed to create post');
        }

        if (failedCount > 0) {
          notificationsService.error(
            `${failedCount} of ${results.length} posts failed to create`,
          );
        } else {
          notificationsService.success(
            isThreadRef.current
              ? 'Thread created successfully'
              : 'Post created successfully',
          );
        }
        logger.info('POST /publishing success');

        if (intent === 'publish') {
          await publishNowOrKeepDraft(
            created.flatMap((item) => (item.id ? [item.id] : [])),
          );
        }

        if (onCreatedRef.current && created[0]?.id) {
          onCreatedRef.current(created[0].id);
        }

        return created[0];
      }

      if (isEditMode && post?.id) {
        entity = post;
        const url = `PATCH /posts/${entity.id}`;
        const result = await postsService.patch(entity.id, {
          credentialId: formData.credentialId || undefined,
          description: descriptionForSubmit,
          format: formData.format,
          label: formData.label?.trim() || '',
          ...(formData.scheduledDate
            ? { scheduledDate: formData.scheduledDate }
            : {}),
          targetExecutionState: formData.targetExecutionState,
          visibility: formData.visibility,
        });

        notificationsService.success('Post updated successfully');
        logger.info(`${url} success`);
        return result;
      } else {
        const mediaCategory = getPostCategoryForMedia(selectedMediaRef.current);
        const adopted = adoptedDraftRef.current;
        const canAdoptDraft =
          adopted !== null &&
          adopted.platform === formData.platform &&
          !formData.parentId &&
          (formData.ingredients ?? []).length === 0;
        const url = canAdoptDraft
          ? `PATCH /posts/${adopted.postId}`
          : 'POST /publishing';
        const result = canAdoptDraft
          ? await postsService.patch(adopted.postId, {
              credentialId: formData.credentialId || undefined,
              description: descriptionForSubmit,
              format: formData.format,
              label: formData.label?.trim() || '',
              ...(formData.scheduledDate
                ? { scheduledDate: formData.scheduledDate }
                : {}),
              targetExecutionState: formData.targetExecutionState,
              visibility: formData.visibility,
            })
          : await postsService.post({
              brandId: brandId || undefined,
              ...(mediaCategory ? { category: mediaCategory } : {}),
              credentialId: formData.credentialId || undefined,
              description: descriptionForSubmit,
              format: formData.format,
              ingredients: formData.ingredients || [],
              label: formData.label?.trim() || '',
              parentId: formData.parentId || undefined,
              platform: formData.platform,
              ...(formData.scheduledDate
                ? { scheduledDate: formData.scheduledDate }
                : {}),
              targetExecutionState: formData.targetExecutionState,
              visibility: formData.visibility,
            });
        adoptedDraftRef.current = null;

        notificationsService.success(
          isThreadReply ? 'Reply added to thread' : 'Post created successfully',
        );
        logger.info(`${url} success`);

        if (intent === 'publish' && result?.id) {
          await publishNowOrKeepDraft([result.id]);
        }

        if (onCreatedRef.current && result?.id) {
          onCreatedRef.current(result.id);
        }

        return result;
      }
    },
    [
      isDestinationComposer,
      isEditMode,
      isThreadReply,
      notificationsService,
      credentials,
      post,
      brandId,
      publishNowOrKeepDraft,
      composerTranslate,
    ],
  );

  const shouldAutoOpen = Boolean(post || ingredient || credential);
  const openKey = post?.id || ingredient?.id || credential?.id || 'new';

  useModalAutoOpen(modalId, {
    isOpen: shouldAutoOpen ? true : undefined,
    openKey,
  });

  const { form, formRef, isSubmitting, onSubmit, closeModal } = useCrudModal<
    IPost,
    PostModalSchema
  >({
    customSubmitHandler,
    defaultValues,
    entity: null, // Don't auto-populate, we handle it manually
    modalId,
    onClose,
    onConfirm: stableOnConfirm,
    schema: postModalSchema,
    serviceFactory: (token) => PostsService.getInstance(token),
  });

  // Manually populate form when post changes (transform objects to IDs)
  useEffect(() => {
    if (post) {
      const resolvedPlatform =
        post.platform ??
        post.credential?.platform ??
        defaultPlatform ??
        Platform.TWITTER;
      form.setValue('label', post.label || '');
      // X never carries formatting, so a legacy post whose description still
      // has stored HTML (pre-#4629) is unwrapped here, once, on load — not on
      // every keystroke, which would fight the textarea for trailing spaces.
      form.setValue(
        'description',
        resolvedPlatform === Platform.TWITTER
          ? stripHtmlToPlainText(post.description)
          : post.description || '',
      );
      form.setValue('format', post.format || PostFormat.STANDARD);
      form.setValue('platform', resolvedPlatform);
      form.setValue(
        'scheduledDate',
        post.scheduledDate ? new Date(post.scheduledDate).toISOString() : '',
      );
      form.setValue(
        'targetExecutionState',
        post.targetExecutionState ?? TargetExecutionState.DRAFT,
      );
      form.setValue('visibility', post.visibility ?? PostVisibility.PUBLIC);
      form.setValue('credentialId', post.credential?.id ?? '');
      form.setValue(
        'ingredients',
        post.ingredients?.map((ing: IIngredient) => ing.id) || [],
      );
    }
  }, [post, form, defaultPlatform]);

  // Called when Cancel button is clicked - initiates the close
  const handleCancel = useCallback(() => {
    closeModal();
  }, [closeModal]);

  const submitWithIntent = useCallback(
    (intent: PostSubmitIntent) => {
      submitIntentRef.current = intent;
      isIntentArmedRef.current = true;
      formRef.current?.requestSubmit();
    },
    [formRef],
  );
  // Enter in a field submits natively and always means "save draft", even
  // after an earlier publish or schedule attempt failed validation.
  const handleFormSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      if (!isIntentArmedRef.current) {
        submitIntentRef.current = 'draft';
      }
      isIntentArmedRef.current = false;
      return onSubmit(event);
    },
    [onSubmit],
  );
  const handleSaveDraft = useCallback(
    () => submitWithIntent('draft'),
    [submitWithIntent],
  );
  const handlePublishNow = useCallback(
    () => submitWithIntent('publish'),
    [submitWithIntent],
  );
  const handleSchedule = useCallback(
    () => submitWithIntent('schedule'),
    [submitWithIntent],
  );

  // Called by Modal's onClose after modal is closed - just cleanup, don't re-close
  const handleModalClosed = useCallback(() => {
    form.reset(defaultValuesRef.current);
    setSelectedMedia(initialMediaRef.current);
    setSelectedCredentialIds([]);
    setDestination(null);
    setIsThread(false);
    setComposerStep('channels');
    setOpenVersion((version) => version + 1);
  }, [form]);

  const handleViewDetails = useCallback(() => {
    closeModal();
    onViewDetailsRef.current?.();
  }, [closeModal]);

  const selectedCredential = credentials.find(
    (c) => c.id === form.watch('credentialId'),
  );

  // Composer: the text is shown on the most demanding selected channel — a
  // YouTube target first (it needs a title), then any non-X target, else X.
  const composerPlatform = useMemo(
    () =>
      selectedCredentials.find(
        (account) => account.platform === Platform.YOUTUBE,
      )?.platform ??
      selectedCredentials.find((account) => !isXPlatform(account.platform))
        ?.platform ??
      Platform.TWITTER,
    [selectedCredentials],
  );

  const selectedPlatform = isDestinationComposer
    ? composerPlatform
    : selectedCredential?.platform ||
      post?.platform ||
      post?.credential?.platform ||
      form.watch('platform');

  const descriptionText = stripHtmlToPlainText(form.watch('description') || '');

  // Without an account the draft lands on X, so it counts as an X target.
  const hasXTarget = selectedCredentials.some((account) =>
    isXPlatform(account.platform),
  );
  const isLongPost =
    isDestinationComposer &&
    (hasXTarget || (selectedCredentials.length === 0 && !destination)) &&
    !isThread &&
    calculateTweetLength(descriptionText) > X_STANDARD_POST_LIMIT;
  const threadItemCount = useMemo(
    () => (isThread ? splitTextIntoThread(descriptionText).length : 0),
    [descriptionText, isThread],
  );

  const charLimit = isDestinationComposer
    ? Math.min(
        ...(selectedCredentials.length > 0
          ? selectedCredentials.map((account) => account.platform)
          : [Platform.TWITTER]
        ).map((platform) =>
          resolvePlatformCharLimit(
            platform,
            isXPlatform(platform) && (isThread || isLongPost)
              ? PostFormat.LONG_FORM
              : undefined,
          ),
        ),
      )
    : resolvePlatformCharLimit(selectedPlatform, form.watch('format'));

  const currentLength =
    selectedPlatform === Platform.TWITTER
      ? calculateTweetLength(descriptionText)
      : Array.from(descriptionText).length;
  const isOverLimit = currentLength > charLimit;

  // Keep the form's format/platform/account in step with the picker so the
  // existing 25k long-post validation and scheduling rules keep applying.
  useEffect(() => {
    if (!isDestinationComposer) {
      return;
    }
    const nextFormat =
      isLongPost || (isThread && hasXTarget)
        ? PostFormat.LONG_FORM
        : PostFormat.STANDARD;
    form.setValue('format', nextFormat, { shouldValidate: true });
    form.setValue('platform', composerPlatform);
    form.setValue('credentialId', selectedCredentialIds[0] ?? '', {
      shouldValidate: true,
    });
    if (selectedCredentialIds.length === 0) {
      form.setValue('scheduledDate', '');
      form.setValue('targetExecutionState', TargetExecutionState.DRAFT);
    }
  }, [
    composerPlatform,
    form,
    hasXTarget,
    isDestinationComposer,
    isLongPost,
    isThread,
    selectedCredentialIds,
  ]);

  const handleToggleCredential = useCallback((credentialId: string) => {
    setDestination(null);
    setSelectedCredentialIds((current) => {
      const next = current.includes(credentialId)
        ? current.filter((id) => id !== credentialId)
        : [...current, credentialId];
      return next;
    });
  }, []);

  const applyMedia = useCallback(
    (next: IIngredient[]) => {
      setSelectedMedia(next);
      form.setValue(
        'ingredients',
        next.map((item) => item.id),
        { shouldDirty: true, shouldValidate: true },
      );
    },
    [form],
  );

  const addMedia = useCallback(
    (picked: IIngredient[]) => {
      applyMedia(mergePostMedia(selectedMediaRef.current, picked));
    },
    [applyMedia],
  );

  const handlePickFromLibrary = useCallback(
    (kind: ModalPostMediaKind) => {
      openGallery({
        category:
          kind === 'video'
            ? IngredientCategory.VIDEO
            : IngredientCategory.IMAGE,
        onSelect: (items) => addMedia(items as IIngredient[]),
        title:
          kind === 'video'
            ? composerTranslate('libraryVideo')
            : composerTranslate('libraryImage'),
      });
    },
    [addMedia, composerTranslate, openGallery],
  );

  const handleUploadMedia = useCallback(
    (kind: ModalPostMediaKind) => {
      const category =
        kind === 'video' ? IngredientCategory.VIDEO : IngredientCategory.IMAGE;
      openUpload({
        category,
        isMultiple: true,
        onComplete: (uploaded) =>
          addMedia(
            uploaded.filter(
              (item): item is IIngredient =>
                'category' in item && item.category === category,
            ),
          ),
      });
    },
    [addMedia, openUpload],
  );

  const handleRemoveMedia = useCallback(
    (ingredientId: string) => {
      applyMedia(
        selectedMediaRef.current.filter((item) => item.id !== ingredientId),
      );
    },
    [applyMedia],
  );

  const handleSelectDestination = useCallback(
    (nextDestination: ComposerDestination) => {
      setSelectedCredentialIds([]);
      setIsThread(false);
      setDestination((current) =>
        current === nextDestination ? null : nextDestination,
      );
    },
    [],
  );

  useEffect(() => {
    if (!hasXTarget) {
      setIsThread(false);
    }
  }, [hasXTarget]);

  // Article and Newsletter own their editors; hand off instead of submitting.
  const handleContinue = useCallback(() => {
    if (!destination) {
      return;
    }
    closeModal();
    openModal(
      destination === 'article' ? ModalEnum.ARTICLE : ModalEnum.NEWSLETTER,
    );
  }, [closeModal, destination]);

  // What the chosen destinations need attached before delivery, shown up front.
  const mediaTargetPlatforms = useMemo(
    () =>
      isDestinationComposer
        ? [...new Set(selectedCredentials.map((account) => account.platform))]
        : selectedPlatform
          ? [selectedPlatform]
          : [],
    [isDestinationComposer, selectedCredentials, selectedPlatform],
  );
  // Only what the attached media does not cover yet, so the hint clears once
  // a video (or any media) is attached.
  const mediaRequirementHint = useMemo(() => {
    const unmet = getUnmetPostMediaRequirements(
      mediaTargetPlatforms,
      selectedMedia,
    );
    const namesFor = (requirement: 'media' | 'video') =>
      unmet
        .filter((entry) => entry.requirement === requirement)
        .map((entry) => formatPlatformLabel(entry.platform))
        .join(', ');
    const videoNames = namesFor('video');
    const mediaNames = namesFor('media');
    return (
      [
        videoNames
          ? composerTranslate('videoNeeded', { platforms: videoNames })
          : '',
        mediaNames
          ? composerTranslate('mediaNeeded', { platforms: mediaNames })
          : '',
      ]
        .filter(Boolean)
        .join(' ') || null
    );
  }, [composerTranslate, mediaTargetPlatforms, selectedMedia]);

  // YouTube requires a title
  const isTitleRequired = selectedPlatform === Platform.YOUTUBE;
  const titleValue = form.watch('label');
  const isTitleError =
    isTitleRequired && (!titleValue || titleValue.trim() === '');

  const getModalContent = () => {
    if (isEditMode) {
      return {
        description: composerTranslate('editDescription'),
        title: composerTranslate('editTitle'),
      };
    }
    if (isThreadReply) {
      return {
        description: composerTranslate('threadReplyDescription'),
        title: composerTranslate('threadReplyTitle'),
      };
    }
    if (isDestinationComposer) {
      return {
        description: composerTranslate('createDescription'),
        title: composerTranslate('createTitle'),
      };
    }
    return {
      description: composerTranslate('draftDescription'),
      title: composerTranslate('draftTitle'),
    };
  };

  const { title: modalTitle, description: modalDescription } =
    getModalContent();

  return (
    <Modal
      id={modalId}
      accessibleTitle={modalTitle}
      modalBoxClassName="max-w-4xl"
      onClose={handleModalClosed}
    >
      <Form spacing="section" ref={formRef} onSubmit={handleFormSubmit}>
        {isDestinationComposer ? (
          <ModalPostComposerStepper
            step={composerStep}
            onStepChange={setComposerStep}
          />
        ) : (
          <ModalPostSimpleHeader
            title={modalTitle}
            description={modalDescription}
          />
        )}

        <ModalPostSimpleFields
          key={openVersion}
          form={form}
          media={
            isEditMode || isThreadReply
              ? undefined
              : {
                  isDisabled: isSubmitting,
                  items: selectedMedia,
                  onPickFromLibrary: handlePickFromLibrary,
                  onRemove: handleRemoveMedia,
                  onUpload: handleUploadMedia,
                  requirementHint: mediaRequirementHint,
                }
          }
          composer={
            isDestinationComposer
              ? {
                  credentials,
                  destination,
                  hasXTarget,
                  isDisabled: isSubmitting,
                  isLongPost,
                  isThread,
                  onSelectDestination: handleSelectDestination,
                  onEditChannels: () => setComposerStep('channels'),
                  onThreadChange: setIsThread,
                  onToggleCredential: handleToggleCredential,
                  selectedCredentialIds,
                  step: composerStep,
                  threadItemCount,
                }
              : undefined
          }
          credentials={credentials.filter(
            (account) => account.platform === selectedPlatform,
          )}
          isEditMode={isEditMode}
          isSubmitting={isSubmitting}
          selectedPlatform={selectedPlatform}
          charLimit={charLimit}
          currentLength={currentLength}
          isOverLimit={isOverLimit}
          isTitleRequired={isTitleRequired}
          isTitleError={isTitleError}
          onDraftGenerated={(draft) => {
            adoptedDraftRef.current = draft;
          }}
        />

        <ModalPostSimpleActions
          isSubmitting={isSubmitting}
          isOverLimit={isOverLimit}
          isTitleError={isTitleError}
          isFormValid={form.formState.isValid}
          isEditMode={isEditMode}
          isThreadReply={isThreadReply}
          isHandoff={isDestinationComposer && destination !== null}
          isThread={isDestinationComposer && isThread}
          hasPublishChoices={!isEditMode && !isThreadReply}
          hasAccount={Boolean(form.watch('credentialId'))}
          browserTimezone={browserTimezone}
          scheduledDate={form.watch('scheduledDate')}
          onScheduledDateChange={(scheduledDate) =>
            form.setValue('scheduledDate', scheduledDate, {
              shouldValidate: true,
            })
          }
          onSaveDraft={handleSaveDraft}
          onPublishNow={handlePublishNow}
          onSchedule={handleSchedule}
          onContinue={handleContinue}
          composerStep={isDestinationComposer ? composerStep : undefined}
          onComposerStepChange={setComposerStep}
          showViewDetailsButton={showViewDetailsButton}
          onViewDetails={onViewDetails}
          onViewDetailsClick={handleViewDetails}
          onCancel={handleCancel}
        />
      </Form>
    </Modal>
  );
}
