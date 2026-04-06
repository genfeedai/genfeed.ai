import {
  type MonitoredAccountSchema,
  monitoredAccountSchema,
} from '@genfeedai/client/schemas';
import {
  AlertCategory,
  ButtonVariant,
  ModalEnum,
  ReplyBotPlatform,
} from '@genfeedai/enums';
import type { IMonitoredAccount } from '@genfeedai/interfaces';
import {
  hasFormErrors,
  parseFormErrors,
} from '@helpers/ui/form-error/form-error.helper';
import { useCrudModal } from '@hooks/ui/use-crud-modal/use-crud-modal';
import type { ModalMonitoredAccountProps } from '@props/modals/modal.props';
import { MonitoredAccountsService } from '@services/automation/monitored-accounts.service';
import Button from '@ui/buttons/base/Button';
import Alert from '@ui/feedback/alert/Alert';
import FormControl from '@ui/forms/base/form-control/FormControl';
import FormInput from '@ui/forms/inputs/input/form-input/FormInput';
import ModalActions from '@ui/modals/actions/ModalActions';
import Modal from '@ui/modals/modal/Modal';
import { Input } from '@ui/primitives/input';
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

export default function ModalMonitoredAccount({
  account,
  replyBotConfigId,
  onConfirm,
  onClose,
}: ModalMonitoredAccountProps) {
  const { form, formRef, isSubmitting, onSubmit, closeModal, handleDelete } =
    useCrudModal<IMonitoredAccount, MonitoredAccountSchema>({
      defaultValues: {
        avatarUrl: '',
        bio: '',
        displayName: '',
        followersCount: 0,
        isActive: true,
        platform: ReplyBotPlatform.TWITTER,
        platformUserId: '',
        username: '',
      },
      entity: account || null,
      modalId: ModalEnum.MONITORED_ACCOUNT,
      onClose,
      onConfirm,
      schema: monitoredAccountSchema,
      serviceFactory: (token) => MonitoredAccountsService.getInstance(token),
      transformSubmitData: (data) => ({
        ...data,
        replyBotConfig: replyBotConfigId,
      }),
    });

  useEffect(() => {
    if (account) {
      form.setValue('platform', account.platform);
      form.setValue('platformUserId', account.externalId ?? '');
      form.setValue('username', account.username ?? '');
      form.setValue('displayName', account.displayName ?? '');
      form.setValue('avatarUrl', account.avatarUrl ?? '');
      form.setValue('bio', account.bio ?? '');
      form.setValue('followersCount', account.followersCount ?? 0);
      form.setValue('isActive', account.isActive ?? true);
    }
  }, [account, form]);

  const handleChange = (
    e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
  ) => {
    const { name, value } = e.target;
    form.setValue(name as any, value, { shouldValidate: true });
  };

  return (
    <Modal
      id={ModalEnum.MONITORED_ACCOUNT}
      title={account ? 'Edit Monitored Account' : 'Add Monitored Account'}
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

        <div className="space-y-4">
          <FormControl label="Platform">
            <div className="flex flex-wrap gap-4">
              {PLATFORMS.map(({ platform, icon: Icon, color, label }) => (
                <label
                  key={platform}
                  className={`flex items-center gap-2 cursor-pointer p-2 border ${
                    form.watch('platform') === platform
                      ? 'border-primary bg-primary/10'
                      : 'border-white/[0.08]'
                  }`}
                >
                  <input
                    type="radio"
                    name="platform"
                    value={platform}
                    className="h-4 w-4 accent-primary"
                    checked={form.watch('platform') === platform}
                    onChange={() =>
                      form.setValue('platform', platform, {
                        shouldValidate: true,
                      })
                    }
                    disabled={isSubmitting}
                  />
                  <Icon className={color} />
                  <span className="text-sm">{label}</span>
                </label>
              ))}
            </div>
          </FormControl>

          <FormControl label="Username">
            <FormInput
              type="text"
              name="username"
              control={form.control}
              onChange={handleChange}
              placeholder="@username (without the @)"
              isRequired={true}
              isDisabled={isSubmitting}
            />
          </FormControl>

          <FormControl label="Platform User ID">
            <FormInput
              type="text"
              name="platformUserId"
              control={form.control}
              onChange={handleChange}
              placeholder="Platform-specific user ID"
              isRequired={true}
              isDisabled={isSubmitting}
            />
          </FormControl>

          <FormControl label="Display Name">
            <FormInput
              type="text"
              name="displayName"
              control={form.control}
              onChange={handleChange}
              placeholder="Display name (optional)"
              isDisabled={isSubmitting}
            />
          </FormControl>

          <FormControl label="Avatar URL">
            <FormInput
              type="text"
              name="avatarUrl"
              control={form.control}
              onChange={handleChange}
              placeholder="https://... (optional)"
              isDisabled={isSubmitting}
            />
          </FormControl>

          <FormControl label="Bio">
            <FormInput
              type="text"
              name="bio"
              control={form.control}
              onChange={handleChange}
              placeholder="Account bio (optional)"
              isDisabled={isSubmitting}
            />
          </FormControl>

          <FormControl label="Followers Count">
            <Input
              type="number"
              name="followersCount"
              value={form.watch('followersCount') ?? 0}
              onChange={(e) =>
                form.setValue('followersCount', parseInt(e.target.value, 10), {
                  shouldValidate: true,
                })
              }
              min={0}
              disabled={isSubmitting}
            />
          </FormControl>

          <FormControl label="Active">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                className="h-4 w-4 border-input accent-primary"
                checked={form.watch('isActive') ?? true}
                onChange={(e) =>
                  form.setValue('isActive', e.target.checked, {
                    shouldValidate: true,
                  })
                }
                disabled={isSubmitting}
              />
              <span className="text-sm">Monitor this account</span>
            </label>
          </FormControl>
        </div>

        <ModalActions>
          <Button
            label="Cancel"
            variant={ButtonVariant.SECONDARY}
            onClick={() => closeModal()}
            isLoading={isSubmitting}
          />

          {account && handleDelete && (
            <Button
              label={<HiTrash />}
              variant={ButtonVariant.DESTRUCTIVE}
              onClick={handleDelete}
              isLoading={isSubmitting}
            />
          )}

          <Button
            type="submit"
            label={account ? 'Update' : 'Add'}
            variant={ButtonVariant.DEFAULT}
            isLoading={isSubmitting}
            isDisabled={isSubmitting || !form.formState.isValid}
          />
        </ModalActions>
      </form>
    </Modal>
  );
}
