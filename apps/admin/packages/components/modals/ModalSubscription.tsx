import ModalActions from '@components/modals/actions/ModalActions';
import Modal from '@components/modals/modal/Modal';
import {
  type SubscriptionSchema,
  subscriptionSchema,
} from '@genfeedai/client/schemas';
import { AlertCategory, ButtonVariant, ModalEnum } from '@genfeedai/enums';
import type { IOrganizationSetting } from '@genfeedai/interfaces';
import {
  hasFormErrors,
  parseFormErrors,
} from '@helpers/ui/form-error/form-error.helper';
import { closeModal } from '@helpers/ui/modal/modal.helper';
import { standardSchemaResolver } from '@hookform/resolvers/standard-schema';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useFocusFirstInput } from '@hooks/ui/use-focus-first-input/use-focus-first-input';
import { useFormSubmitWithState } from '@hooks/utils/use-form-submit/use-form-submit';
import type { ModalOrganizationProps } from '@props/modals/modal.props';
import { logger } from '@services/core/logger.service';
import { OrganizationsService } from '@services/organization/organizations.service';
import Alert from '@ui/feedback/alert/Alert';
import Spinner from '@ui/feedback/spinner/Spinner';
import FormControl from '@ui/forms/base/form-control/FormControl';
import { Button } from '@ui/primitives/button';
import { Input } from '@ui/primitives/input';
import { type ChangeEvent, useCallback } from 'react';
import { useForm } from 'react-hook-form';

export default function ModalSubscription({
  organizationId,
  onConfirm,
}: ModalOrganizationProps) {
  const getOrganizationsService = useAuthedService((token: string) =>
    OrganizationsService.getInstance(token),
  );

  const form = useForm<SubscriptionSchema>({
    defaultValues: { amount: 0 },
    resolver: standardSchemaResolver(subscriptionSchema),
  });

  const formRef = useFocusFirstInput<HTMLFormElement>();

  const closeSubscriptionModal = useCallback(() => {
    closeModal(ModalEnum.SUBSCRIPTION);
    form.reset({ amount: 0 });
  }, [form]);

  const handleSubmit = useCallback(async () => {
    if (!organizationId) {
      return;
    }

    const amount = form.getValues().amount;
    const url = `PATCH /organizations/${organizationId}`;

    try {
      const service = await getOrganizationsService();

      // Update subscription directly
      const updateData: Partial<IOrganizationSetting> & {
        subscription: number;
      } = {
        subscription: amount,
      };

      await service.patchSettings(organizationId, updateData);

      logger.info(`${url} success`, { subscription: amount });
      closeSubscriptionModal();
      onConfirm();
    } catch (error) {
      logger.error(`${url} failed`, error);
    }
  }, [
    organizationId,
    form,
    getOrganizationsService,
    closeSubscriptionModal,
    onConfirm,
  ]);

  const { isSubmitting, onSubmit } = useFormSubmitWithState(() =>
    handleSubmit(),
  );

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const value = Number(e.target.value);
    form.setValue('amount', value, { shouldValidate: true });
  };

  return (
    <Modal id={ModalEnum.SUBSCRIPTION} title="Edit Amount">
      <form ref={formRef} onSubmit={onSubmit} className="space-y-4">
        {hasFormErrors(form.formState.errors) && (
          <Alert type={AlertCategory.ERROR} className="mb-4">
            <div className="space-y-1">
              {parseFormErrors(form.formState.errors).map((error) => (
                <div key={error}>{error}</div>
              ))}
            </div>
          </Alert>
        )}

        <FormControl label="Amount">
          <Input
            type="number"
            {...form.register('amount', { valueAsNumber: true })}
            name="amount"
            onChange={handleChange}
            disabled={isSubmitting}
          />
        </FormControl>

        <ModalActions>
          <Button
            variant={ButtonVariant.SECONDARY}
            type="button"
            onClick={closeSubscriptionModal}
            disabled={isSubmitting}
          >
            {isSubmitting ? <Spinner /> : null}
            Cancel
          </Button>

          <Button
            type="submit"
            variant={ButtonVariant.DEFAULT}
            disabled={isSubmitting || !form.formState.isValid}
          >
            {isSubmitting ? <Spinner /> : null}
            Save
          </Button>
        </ModalActions>
      </form>
    </Modal>
  );
}
