import {
  type ReplyBotConfigSchema,
  replyBotConfigSchema,
} from '@genfeedai/client/schemas';
import {
  AlertCategory,
  ButtonVariant,
  ModalEnum,
  ReplyBotActionType,
  ReplyBotPlatform,
  ReplyBotType,
} from '@genfeedai/enums';
import type {
  IReplyBotConfig,
  IReplyBotRateLimits,
} from '@genfeedai/interfaces';
import {
  hasFormErrors,
  parseFormErrors,
} from '@helpers/ui/form-error/form-error.helper';
import { useCrudModal } from '@hooks/ui/use-crud-modal/use-crud-modal';
import type { ModalReplyBotProps } from '@props/modals/modal.props';
import { ReplyBotConfigsService } from '@services/automation/reply-bot-configs.service';
import Alert from '@ui/feedback/alert/Alert';
import ModalActions from '@ui/modals/actions/ModalActions';
import Modal from '@ui/modals/modal/Modal';
import { Button } from '@ui/primitives/button';
import FormControl from '@ui/primitives/field';
import { Input } from '@ui/primitives/input';
import { RadioGroup, RadioGroupItem } from '@ui/primitives/radio-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import { Textarea } from '@ui/primitives/textarea';
import { type ChangeEvent, useEffect } from 'react';
import {
  FaInstagram,
  FaReddit,
  FaTiktok,
  FaXTwitter,
  FaYoutube,
} from 'react-icons/fa6';
import { HiTrash } from 'react-icons/hi2';

const PLATFORMS = [
  {
    color: 'text-slate-300',
    icon: FaXTwitter,
    label: 'Twitter/X',
    platform: ReplyBotPlatform.TWITTER,
  },
  {
    color: 'text-pink-500',
    icon: FaInstagram,
    label: 'Instagram',
    platform: ReplyBotPlatform.INSTAGRAM,
  },
  {
    color: 'text-slate-300',
    icon: FaTiktok,
    label: 'TikTok',
    platform: ReplyBotPlatform.TIKTOK,
  },
  {
    color: 'text-red-500',
    icon: FaYoutube,
    label: 'YouTube',
    platform: ReplyBotPlatform.YOUTUBE,
  },
  {
    color: 'text-orange-500',
    icon: FaReddit,
    label: 'Reddit',
    platform: ReplyBotPlatform.REDDIT,
  },
] as const;

const BOT_TYPES = [
  {
    description: 'Reply to users who reply to your tweets',
    label: 'Reply Guy',
    type: ReplyBotType.REPLY_GUY,
  },
  {
    description: 'Watch specific accounts and auto-reply when they tweet',
    label: 'Account Monitor',
    type: ReplyBotType.ACCOUNT_MONITOR,
  },
  {
    description: 'Respond to comments on your content',
    label: 'Comment Responder',
    type: ReplyBotType.COMMENT_RESPONDER,
  },
] as const;

const ACTION_TYPES = [
  { label: 'Reply Only', type: ReplyBotActionType.REPLY_ONLY },
  { label: 'DM Only', type: ReplyBotActionType.DM_ONLY },
  { label: 'Reply + DM', type: ReplyBotActionType.REPLY_AND_DM },
] as const;

export default function ModalReplyBot({
  replyBot,
  onConfirm,
  onClose,
}: ModalReplyBotProps) {
  const { form, formRef, isSubmitting, onSubmit, closeModal, handleDelete } =
    useCrudModal<IReplyBotConfig, ReplyBotConfigSchema>({
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

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      if (!isSubmitting && form.formState.isValid) {
        onSubmit(e as any);
      }
    }
  };

  const handleChange = (
    e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
  ) => {
    const { name, value } = e.target;
    form.setValue(name as any, value, { shouldValidate: true });
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

  return (
    <Modal
      id={ModalEnum.REPLY_BOT}
      title={replyBot ? 'Edit Reply Bot' : 'Create Reply Bot'}
    >
      <form ref={formRef} onSubmit={onSubmit}>
        {hasFormErrors(form.formState.errors) && (
          <Alert type={AlertCategory.ERROR} className="mb-4">
            <div className="space-y-1">
              {parseFormErrors(form.formState.errors).map((error, index) => (
                <div key={index}>{error}</div>
              ))}
            </div>
          </Alert>
        )}

        <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2">
          <FormControl label="Bot Name">
            <Input
              type="text"
              name="name"
              control={form.control}
              onChange={handleChange}
              placeholder="Enter bot name"
              isRequired={true}
              isDisabled={isSubmitting}
            />
          </FormControl>

          <FormControl label="Description">
            <Textarea
              name="description"
              control={form.control}
              onChange={handleChange}
              placeholder="Enter description (optional)"
              isDisabled={isSubmitting}
              onKeyDown={handleKeyDown}
            />
          </FormControl>

          <FormControl label="Bot Type">
            <Select
              value={form.watch('type')}
              onValueChange={(value) => {
                handleChange({
                  target: { name: 'type', value },
                } as ChangeEvent<HTMLSelectElement>);
              }}
              disabled={isSubmitting}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {BOT_TYPES.map(({ type, label, description }) => (
                  <SelectItem key={type} value={type}>
                    {label} - {description}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormControl>

          <FormControl label="Platform">
            <RadioGroup
              className="flex flex-wrap gap-4"
              value={form.watch('platform')}
              onValueChange={(platform) =>
                form.setValue('platform', platform as ReplyBotPlatform, {
                  shouldValidate: true,
                })
              }
            >
              {PLATFORMS.map(({ platform, icon: Icon, color, label }) => (
                <label
                  key={platform}
                  className={`flex items-center gap-2 cursor-pointer p-2 border ${
                    form.watch('platform') === platform
                      ? 'border-primary bg-primary/10'
                      : 'border-white/[0.08]'
                  }`}
                >
                  <RadioGroupItem value={platform} disabled={isSubmitting} />
                  <Icon className={color} />
                  <span className="text-sm">{label}</span>
                </label>
              ))}
            </RadioGroup>
          </FormControl>

          <FormControl label="Action Type">
            <Select
              value={form.watch('actionType')}
              onValueChange={(value) => {
                handleChange({
                  target: { name: 'actionType', value },
                } as ChangeEvent<HTMLSelectElement>);
              }}
              disabled={isSubmitting}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ACTION_TYPES.map(({ type, label }) => (
                  <SelectItem key={type} value={type}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormControl>

          <div className="flex items-center gap-4 my-4">
            <div className="h-px bg-border flex-1" />
            <span className="text-sm text-muted-foreground">
              Reply Settings
            </span>
            <div className="h-px bg-border flex-1" />
          </div>

          <FormControl label="Reply Tone">
            <Input
              type="text"
              name="replyTone"
              control={form.control}
              onChange={handleChange}
              placeholder="e.g., friendly, professional, casual"
              isDisabled={isSubmitting}
            />
          </FormControl>

          <FormControl label="Reply Instructions">
            <Textarea
              name="replyInstructions"
              control={form.control}
              onChange={handleChange}
              placeholder="Instructions for AI to follow when generating replies..."
              isDisabled={isSubmitting}
              onKeyDown={handleKeyDown}
              className="h-24"
            />
          </FormControl>

          <div className="flex items-center gap-4 my-4">
            <div className="h-px bg-border flex-1" />
            <span className="text-sm text-muted-foreground">Rate Limits</span>
            <div className="h-px bg-border flex-1" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <FormControl label="Max Replies/Hour">
              <Input
                type="number"
                value={rateLimits.maxRepliesPerHour}
                onChange={(e) =>
                  handleRateLimitChange(
                    'maxRepliesPerHour',
                    parseInt(e.target.value, 10),
                  )
                }
                min={1}
                max={100}
                disabled={isSubmitting}
              />
            </FormControl>

            <FormControl label="Max Replies/Day">
              <Input
                type="number"
                value={rateLimits.maxRepliesPerDay}
                onChange={(e) =>
                  handleRateLimitChange(
                    'maxRepliesPerDay',
                    parseInt(e.target.value, 10),
                  )
                }
                min={1}
                max={500}
                disabled={isSubmitting}
              />
            </FormControl>

            {showDmSettings && (
              <>
                <FormControl label="Max DMs/Hour">
                  <Input
                    type="number"
                    value={rateLimits.maxDmsPerHour}
                    onChange={(e) =>
                      handleRateLimitChange(
                        'maxDmsPerHour',
                        parseInt(e.target.value, 10),
                      )
                    }
                    min={0}
                    max={50}
                    disabled={isSubmitting}
                  />
                </FormControl>

                <FormControl label="Max DMs/Day">
                  <Input
                    type="number"
                    value={rateLimits.maxDmsPerDay}
                    onChange={(e) =>
                      handleRateLimitChange(
                        'maxDmsPerDay',
                        parseInt(e.target.value, 10),
                      )
                    }
                    min={0}
                    max={200}
                    disabled={isSubmitting}
                  />
                </FormControl>
              </>
            )}

            <FormControl label="Cooldown (minutes)">
              <Input
                type="number"
                value={rateLimits.cooldownMinutes}
                onChange={(e) =>
                  handleRateLimitChange(
                    'cooldownMinutes',
                    parseInt(e.target.value, 10),
                  )
                }
                min={0}
                max={60}
                disabled={isSubmitting}
              />
            </FormControl>
          </div>

          {form.watch('type') === ReplyBotType.COMMENT_RESPONDER && (
            <>
              <div className="flex items-center gap-4 my-4">
                <div className="h-px bg-border flex-1" />
                <span className="text-sm text-muted-foreground">
                  Keyword Triggers
                </span>
                <div className="h-px bg-border flex-1" />
              </div>

              <FormControl label="Include Keywords (comma-separated)">
                <Input
                  type="text"
                  name="filters.includeKeywords"
                  control={form.control}
                  onChange={(e) => {
                    const keywords = e.target.value
                      .split(',')
                      .map((k: string) => k.trim())
                      .filter(Boolean);
                    form.setValue('filters.includeKeywords', keywords, {
                      shouldValidate: true,
                    });
                  }}
                  placeholder="INFO, YES, SEND"
                  isDisabled={isSubmitting}
                />
              </FormControl>
              <p className="text-xs text-foreground/50 -mt-2">
                Only DM users who comment these words. Post &quot;Comment INFO
                to get our free course&quot; then the bot auto-DMs commenters.
              </p>

              <FormControl label="Exclude Keywords (comma-separated)">
                <Input
                  type="text"
                  name="filters.excludeKeywords"
                  control={form.control}
                  onChange={(e) => {
                    const keywords = e.target.value
                      .split(',')
                      .map((k: string) => k.trim())
                      .filter(Boolean);
                    form.setValue('filters.excludeKeywords', keywords, {
                      shouldValidate: true,
                    });
                  }}
                  placeholder="spam, unsubscribe"
                  isDisabled={isSubmitting}
                />
              </FormControl>
            </>
          )}

          {showDmSettings && (
            <>
              <div className="flex items-center gap-4 my-4">
                <div className="h-px bg-border flex-1" />
                <span className="text-sm text-muted-foreground">
                  DM Message Settings
                </span>
                <div className="h-px bg-border flex-1" />
              </div>

              <FormControl label="Product Context">
                <Textarea
                  name="dmConfig.context"
                  control={form.control}
                  onChange={(e) => {
                    form.setValue('dmConfig.context', e.target.value, {
                      shouldValidate: true,
                    });
                  }}
                  placeholder="What product are you selling? Describe your offer..."
                  isDisabled={isSubmitting}
                  onKeyDown={handleKeyDown}
                  className="h-20"
                />
              </FormControl>

              <FormControl label="Custom DM Instructions">
                <Textarea
                  name="dmConfig.customInstructions"
                  control={form.control}
                  onChange={(e) => {
                    form.setValue(
                      'dmConfig.customInstructions',
                      e.target.value,
                      { shouldValidate: true },
                    );
                  }}
                  placeholder="Any specific instructions for the DM?"
                  isDisabled={isSubmitting}
                  onKeyDown={handleKeyDown}
                  className="h-20"
                />
              </FormControl>

              <FormControl label="CTA Link">
                <Input
                  type="text"
                  name="dmConfig.ctaLink"
                  control={form.control}
                  onChange={(e) => {
                    form.setValue('dmConfig.ctaLink', e.target.value, {
                      shouldValidate: true,
                    });
                  }}
                  placeholder="https://app.genfeed.ai"
                  isDisabled={isSubmitting}
                />
              </FormControl>

              <FormControl label="Offer">
                <Input
                  type="text"
                  name="dmConfig.offer"
                  control={form.control}
                  onChange={(e) => {
                    form.setValue('dmConfig.offer', e.target.value, {
                      shouldValidate: true,
                    });
                  }}
                  placeholder="30-Day Content Sprint"
                  isDisabled={isSubmitting}
                />
              </FormControl>
            </>
          )}
        </div>

        <ModalActions>
          <Button
            label="Cancel"
            variant={ButtonVariant.SECONDARY}
            onClick={() => closeModal()}
            isLoading={isSubmitting}
          />

          {replyBot && handleDelete && (
            <Button
              label={<HiTrash />}
              variant={ButtonVariant.DESTRUCTIVE}
              onClick={handleDelete}
              isLoading={isSubmitting}
            />
          )}

          <Button
            type="submit"
            label={replyBot ? 'Update' : 'Create'}
            variant={ButtonVariant.DEFAULT}
            isLoading={isSubmitting}
            isDisabled={isSubmitting || !form.formState.isValid}
          />
        </ModalActions>
      </form>
    </Modal>
  );
}
