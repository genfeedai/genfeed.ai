import {
  type ReplyBotConfigSchema,
  replyBotConfigSchema,
} from '@genfeedai/client/schemas';
import {
  ModalEnum,
  ReplyBotActionType,
  ReplyBotPlatform,
  ReplyBotType,
} from '@genfeedai/enums';
import { useCrudModal } from '@genfeedai/hooks/ui/use-crud-modal/use-crud-modal';
import type {
  IReplyBotConfig,
  IReplyBotRateLimits,
} from '@genfeedai/interfaces';
import type { ModalReplyBotProps } from '@genfeedai/props/modals/modal.props';
import { ReplyBotConfigsService } from '@genfeedai/services/automation/reply-bot-configs.service';
import { type ChangeEvent, useEffect } from 'react';

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
      description: '',
      isActive: false,
      monitoredAccounts: [],
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
          activeHoursStart?: number;
          activeHoursEnd?: number;
          activeDays?: number[];
        };
        form.setValue('schedule', {
          activeDays: schedule.activeDays ?? [1, 2, 3, 4, 5],
          activeHoursEnd: schedule.activeHoursEnd ?? 17,
          activeHoursStart: schedule.activeHoursStart ?? 9,
          timezone: schedule.timezone ?? 'UTC',
        });
      }
      if (replyBot.filters) {
        const filters = replyBot.filters as {
          minFollowers?: number;
          maxFollowers?: number;
          mustHaveBio?: boolean;
          excludeKeywords?: string[];
          includeKeywords?: string[];
          languageFilter?: string[];
        };
        form.setValue('filters', {
          excludeKeywords: filters.excludeKeywords ?? [],
          includeKeywords: filters.includeKeywords ?? [],
          languageFilter: filters.languageFilter ?? [],
          maxFollowers: filters.maxFollowers,
          minFollowers: filters.minFollowers ?? 0,
          mustHaveBio: filters.mustHaveBio ?? false,
        });
      }
      form.setValue('monitoredAccounts', replyBot.monitoredAccounts ?? []);
    }
  }, [replyBot, form]);

  const processKeyDownModalReplyBot = (
    e: React.KeyboardEvent<HTMLTextAreaElement>,
  ) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      if (!isSubmitting && form.formState.isValid) {
        onSubmit(e as never);
      }
    }
  };

  const updateModalReplyBot = (
    e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
  ) => {
    const { name, value } = e.target;
    form.setValue(name as never, value as never, { shouldValidate: true });
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
