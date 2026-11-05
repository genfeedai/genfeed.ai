import {
  type ElementSimpleSchema,
  elementSimpleSchema,
} from '@genfeedai/client/schemas';
import { ButtonVariant } from '@genfeedai/contracts';
import type { IElementMood } from '@genfeedai/contracts/interfaces';
import { normalizeElementKey } from '@ui/display/element-scope-badge/element-row-sidebar';
import ModalActions from '@ui/modals/actions/ModalActions';
import Modal from '@ui/modals/modal/Modal';
import { Button } from '@ui/primitives/button';
import FormControl from '@ui/primitives/field';
import { Form } from '@ui/primitives/form';
import { Input } from '@ui/primitives/input';
import { useTranslations } from 'next-intl';
import type { ChangeEvent } from 'react';
import ElementPlatformFields from '@/components/modals/elements/shared/ElementPlatformFields';
import { ELEMENT_CREATE_MODAL_CONFIG } from '@/components/modals/elements/shared/element-create-modal.config';
import type { ElementCreateModalProps } from '@/features/admin/props/element-create-modal.props';
import { useCrudModal } from '@/hooks/ui/use-crud-modal/use-crud-modal';

export default function ElementCreateModal({
  modalId,
  onConfirm,
  onClose,
}: ElementCreateModalProps) {
  const t = useTranslations('ui.createModal');
  const fields = useTranslations('ui.presetFields');
  const config = ELEMENT_CREATE_MODAL_CONFIG[modalId];
  const { form, formRef, isSubmitting, onSubmit, closeModal } = useCrudModal<
    Pick<IElementMood, 'id'>,
    ElementSimpleSchema
  >({
    defaultValues: config.defaultValues,
    entity: null,
    modalId,
    onClose,
    onConfirm,
    schema: elementSimpleSchema,
    serviceFactory: config.serviceFactory,
  });

  function updateField(
    event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) {
    const { name, value } = event.target;
    switch (name) {
      case 'key':
        form.setValue('key', normalizeElementKey(value), {
          shouldValidate: true,
        });
        break;
      case 'label':
        form.setValue('label', value, { shouldValidate: true });
        break;
      case 'description':
        form.setValue('description', value, { shouldValidate: true });
        break;
    }
  }

  return (
    <Modal id={modalId} title={t(config.titleKey)}>
      <Form ref={formRef} onSubmit={onSubmit}>
        <FormControl label={fields('label')}>
          <Input
            type="text"
            name="label"
            control={form.control}
            onChange={updateField}
            placeholder={fields('labelPlaceholder')}
            isRequired
            isDisabled={isSubmitting}
          />
        </FormControl>
        <FormControl label={fields('key')}>
          <Input
            type="text"
            name="key"
            aria-label={fields('key')}
            control={form.control}
            onChange={updateField}
            placeholder={fields('keyPlaceholder')}
            isRequired
            isDisabled={isSubmitting}
          />
          <p className="text-xs text-foreground/70 mt-1">{fields('keyHelp')}</p>
        </FormControl>
        <FormControl label={fields('description')}>
          <Input
            name="description"
            control={form.control}
            onChange={updateField}
            placeholder={fields('descriptionPlaceholder')}
            isDisabled={isSubmitting}
          />
        </FormControl>
        {'isActive' in config.defaultValues && (
          <ElementPlatformFields
            isActive={form.watch('isActive') ?? true}
            isDisabled={isSubmitting}
            onIsActiveChange={(isActive) =>
              form.setValue('isActive', isActive, { shouldValidate: true })
            }
            onSortOrderChange={(sortOrder) =>
              form.setValue('sortOrder', sortOrder, { shouldValidate: true })
            }
            sortOrder={form.watch('sortOrder') ?? 0}
          />
        )}
        <ModalActions>
          <Button
            label={t('cancel')}
            variant={ButtonVariant.SECONDARY}
            onClick={() => closeModal()}
            isLoading={isSubmitting}
          />
          <Button
            type="submit"
            label={t('create')}
            variant={ButtonVariant.DEFAULT}
            isLoading={isSubmitting}
            isDisabled={isSubmitting || !form.formState.isValid}
          />
        </ModalActions>
      </Form>
    </Modal>
  );
}
