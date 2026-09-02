import {
  type ReplyBotConfigSchema,
  replyBotConfigSchema,
} from '@genfeedai/client/schemas';
import {
  ModalEnum,
  ReplyBotActionType,
  ReplyBotPlatform,
  ReplyBotType,
} from '@genfeedai/contracts';
import type {
  IReplyBotConfig,
  IReplyBotRateLimits,
} from '@genfeedai/contracts/interfaces';
import { useCrudModal } from '@genfeedai/hooks/ui/use-crud-modal/use-crud-modal';
import type { ModalReplyBotProps } from '@genfeedai/props/modals/modal.props';
import { ReplyBotConfigsService } from '@genfeedai/services/automation/reply-bot-configs.service';
import { type ChangeEvent, useEffect } from 'react';
import type { FieldPath, FieldPathValue } from 'react-hook-form';

const DEFAULT_ACTIVE_DAYS = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
] as const;

type ActiveDay = NonNullable<
  ReplyBotConfigSchema['schedule']
>['activeDays'][number];

const ACTIVE_DAYS = [
  'sunday',
  ...DEFAULT_ACTIVE_DAYS,
  'saturday',
] as const satisfies readonly ActiveDay[];

function isActiveDay(value: string): value is ActiveDay {
  return ACTIVE_DAYS.some((day) => day === value);
}

export function useModalReplyBot({
  replyBot,
  onConfirm,
  onClose,
}: ModalReplyBotProps) {
  const {
    form,
    formRef,
    isSubmitting,
    onSubmit,
    closeModal,
    handleDelete: deleteModalReplyBot,
  } = useCrudModal<IReplyBotConfig, ReplyBotConfigSchema>({
    defaultValues: {
      actionType: ReplyBotActionType.REPLY_ONLY,
      credentialId: undefined,
      description: '',
      isActive: false,
      monitoredAccountIds: [],
      name: '',
      platform: ReplyBotPlatform.TWITTER,
      rateLimits: {
        cooldownMinutes: 5,
        maxDmsPerDay: 20,
        maxDmsPerHour: 5,
        maxRepliesPerDay: 50,
        maxRepliesPerHour: 10,
      },
      replyInstructions: '',
      replyTone: '',
      type: ReplyBotType.REPLY_GUY,
    },
    entity: replyBot || null,
    modalId: ModalEnum.REPLY_BOT,
    onClose,
    onConfirm,
    schema: replyBotConfigSchema,
    serviceFactory: (token) => ReplyBotConfigsService.getInstance(token),
  });

  useEffect(() => {
    if (replyBot) {
      form.setValue('name', replyBot.name ?? '');
      form.setValue('credentialId', replyBot.credentialId);
      form.setValue('description', replyBot.description ?? '');
      form.setValue('type', replyBot.type);
      form.setValue('platform', replyBot.platform);
      form.setValue('actionType', replyBot.actionType);
      form.setValue('isActive', replyBot.isActive);
      form.setValue('replyTone', replyBot.replyTone ?? '');
      form.setValue('replyInstructions', replyBot.replyInstructions ?? '');
      const extendedRateLimits = replyBot.rateLimits as
        | IReplyBotRateLimits
        | undefined;
      form.setValue('rateLimits', {
        cooldownMinutes: extendedRateLimits?.cooldownMinutes ?? 5,
        maxDmsPerDay: extendedRateLimits?.maxDmsPerDay ?? 20,
        maxDmsPerHour: extendedRateLimits?.maxDmsPerHour ?? 5,
        maxRepliesPerDay: extendedRateLimits?.maxRepliesPerDay ?? 50,
        maxRepliesPerHour: extendedRateLimits?.maxRepliesPerHour ?? 10,
      });
      if (replyBot.dmConfig) {
        form.setValue('dmConfig', {
          context: replyBot.dmConfig.context ?? '',
          ctaLink: replyBot.dmConfig.ctaLink ?? '',
          customInstructions: replyBot.dmConfig.customInstructions ?? '',
          delaySeconds: replyBot.dmConfig.delaySeconds ?? 60,
          enabled: replyBot.dmConfig.enabled ?? false,
          offer: replyBot.dmConfig.offer ?? '',
          template: replyBot.dmConfig.template ?? '',
          useAiGeneration: replyBot.dmConfig.useAiGeneration ?? true,
        });
      }
      if (replyBot.schedule) {
        const schedule = replyBot.schedule as {
          timezone?: string;
          activeHoursStart?: string;
          activeHoursEnd?: string;
          activeDays?: string[];
          enabled?: boolean;
        };
        form.setValue('schedule', {
          activeDays: schedule.activeDays?.filter(isActiveDay) ?? [
            ...DEFAULT_ACTIVE_DAYS,
          ],
          activeHoursEnd: schedule.activeHoursEnd ?? '17:00',
          activeHoursStart: schedule.activeHoursStart ?? '09:00',
          enabled: schedule.enabled ?? false,
          timezone: schedule.timezone ?? 'UTC',
        });
      }
      if (replyBot.filters) {
        const filters = replyBot.filters as {
          minFollowers?: number;
          maxFollowers?: number;
          mustHaveBio?: boolean;
          excludeAuthorIds?: string[];
          excludeAuthors?: string[];
          excludeKeywords?: string[];
          excludeUrls?: string[];
          includeKeywords?: string[];
          languageFilter?: string[];
          maxAgeHours?: number;
          minTextLength?: number;
        };
        form.setValue('filters', {
          excludeAuthorIds: filters.excludeAuthorIds ?? [],
          excludeAuthors: filters.excludeAuthors ?? [],
          excludeKeywords: filters.excludeKeywords ?? [],
          excludeUrls: filters.excludeUrls ?? [],
          includeKeywords: filters.includeKeywords ?? [],
          languageFilter: filters.languageFilter ?? [],
          maxAgeHours: filters.maxAgeHours,
          maxFollowers: filters.maxFollowers,
          minFollowers: filters.minFollowers ?? 0,
          minTextLength: filters.minTextLength,
          mustHaveBio: filters.mustHaveBio ?? false,
        });
      }
      form.setValue('monitoredAccountIds', replyBot.monitoredAccountIds ?? []);
    }
  }, [replyBot, form]);

  const processKeyDownModalReplyBot = (
    e: React.KeyboardEvent<HTMLTextAreaElement>,
  ) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      if (!isSubmitting && form.formState.isValid) {
        onSubmit(e);
      }
    }
  };

  const updateModalReplyBot = (
    e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
  ) => {
    const { name, value } = e.target;
    form.setValue(
      name as FieldPath<ReplyBotConfigSchema>,
      value as FieldPathValue<
        ReplyBotConfigSchema,
        FieldPath<ReplyBotConfigSchema>
      >,
      { shouldValidate: true },
    );
  };

  const handleRateLimitChange = (field: string, value: number) => {
    const currentRateLimits = form.getValues('rateLimits');
    form.setValue(
      'rateLimits',
      { ...currentRateLimits, [field]: value },
      { shouldValidate: true },
    );
  };

  const watchedActionType = form.watch('actionType');
  const rateLimits = form.watch('rateLimits') || {
    cooldownMinutes: 5,
    maxDmsPerDay: 20,
    maxDmsPerHour: 5,
    maxRepliesPerDay: 50,
    maxRepliesPerHour: 10,
  };

  const showDmSettings =
    watchedActionType === ReplyBotActionType.DM_ONLY ||
    watchedActionType === ReplyBotActionType.REPLY_AND_DM;

  return {
    closeModal,
    deleteModalReplyBot,
    form,
    formRef,
    handleRateLimitChange,
    isSubmitting,
    onSubmit,
    processKeyDownModalReplyBot,
    rateLimits,
    showDmSettings,
    updateModalReplyBot,
  };
}
