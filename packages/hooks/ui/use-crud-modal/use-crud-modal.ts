import type { ModalEnum } from '@genfeedai/enums';
import type { BaseService } from '@genfeedai/services/core/base.service';
import { logger } from '@genfeedai/services/core/logger.service';
import { NotificationsService } from '@genfeedai/services/core/notifications.service';
import { closeModal as closeModalHelper } from '@helpers/ui/modal/modal.helper';
import { standardSchemaResolver } from '@hookform/resolvers/standard-schema';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useFocusFirstInput } from '@hooks/ui/use-focus-first-input/use-focus-first-input';
import { useFormSubmitWithState } from '@hooks/utils/use-form-submit/use-form-submit';
import type { StandardSchemaV1 } from '@standard-schema/spec';
import type { FormEvent, RefObject } from 'react';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import {
  type DefaultValues,
  type FieldValues,
  type Path,
  type PathValue,
  type Resolver,
  type UseFormReturn,
  useForm,
} from 'react-hook-form';

export interface CrudModalOptions<T, Schema extends FieldValues> {
  entity: T | null;
  schema: StandardSchemaV1;
  serviceFactory: (token: string) => BaseService<any>;
  modalId: ModalEnum;
  onConfirm: (isRefreshing?: boolean) => void;
  onClose?: () => void;
  defaultValues?: DefaultValues<Schema>;
  transformSubmitData?: (formData: Schema) => any;
  customSubmitHandler?: (
    service: BaseService<any>,
    entity: T | null,
    formData: Schema,
  ) => Promise<T>;
}

export interface CrudModalReturn<Schema extends FieldValues> {
  form: UseFormReturn<Schema>;
  formRef: RefObject<HTMLFormElement | null>;
  isSubmitting: boolean;

  onSubmit: (e: FormEvent<HTMLFormElement>) => void;
  closeModal: (isSuccess?: boolean) => void;
  handleDelete?: () => Promise<void>;
}

export function useCrudModal<
  T extends { id: string },
  Schema extends FieldValues,
>({
  modalId,
  entity,
  schema,
  defaultValues = {} as DefaultValues<Schema>,

  serviceFactory,
  onConfirm,
  onClose,

  transformSubmitData,
  customSubmitHandler,
}: CrudModalOptions<T, Schema>): CrudModalReturn<Schema> {
  const getService = useAuthedService(serviceFactory);
  const notificationsService = NotificationsService.getInstance();

  const formRef = useFocusFirstInput<HTMLFormElement>();

  const form = useForm<Schema, any, Schema>({
    defaultValues: defaultValues as DefaultValues<Schema>,
    resolver: standardSchemaResolver(
      schema as StandardSchemaV1<Schema, unknown>,
    ) as Resolver<Schema>,
  });

  // Use refs for callbacks to prevent unnecessary effect reruns
  const onConfirmRef = useRef(onConfirm);
  onConfirmRef.current = onConfirm;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Memoize defaultValues to prevent object identity changes
  const _defaultValuesKey = useMemo(
    () => JSON.stringify(defaultValues),
    [defaultValues],
  );
  const stableDefaultValues = useMemo(
    () => defaultValues,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [defaultValues],
  );

  const closeModal = useCallback(
    (isSuccess: boolean = false) => {
      closeModalHelper(modalId);

      // Reset form to default values
      form.reset(stableDefaultValues);

      if (isSuccess) {
        onConfirmRef.current(true);
      } else {
        // Call onClose callback when closing without success (cancel)
        onCloseRef.current?.();
      }
    },
    [modalId, form, stableDefaultValues],
  );

  const handleSubmit = useCallback(async () => {
    const isUpdate = !!entity;
    const url = isUpdate
      ? `PATCH /${modalId}/${entity.id}`
      : `POST /${modalId}`;

    try {
      const service = await getService();

      const formData = form.getValues();
      const submitData = transformSubmitData
        ? transformSubmitData(formData)
        : formData;

      let result: T;

      if (customSubmitHandler) {
        result = await customSubmitHandler(service, entity, formData);
      } else if (isUpdate) {
        result = await service.patch(entity.id, submitData);
      } else {
        result = await service.post(submitData);
      }

      logger.info(`${url} success`, result);
      closeModal(true);
    } catch (error) {
      logger.error(`${url} failed`, error);
      notificationsService.error(
        isUpdate ? 'Failed to update' : 'Failed to create',
      );
    }
  }, [
    entity,
    modalId,
    getService,
    form,
    transformSubmitData,
    customSubmitHandler,
    closeModal,
    notificationsService,
  ]);

  const { isSubmitting, onSubmit } = useFormSubmitWithState(() =>
    handleSubmit(),
  );

  // Track entity ID to prevent unnecessary resets
  const lastEntityIdRef = useRef<string | null>(null);

  useEffect(() => {
    const currentEntityId = entity?.id ?? null;

    // Only run if entity changed (not just reference)
    if (currentEntityId === lastEntityIdRef.current) {
      return;
    }
    lastEntityIdRef.current = currentEntityId;

    if (entity) {
      // Populate form with entity values
      Object.keys(defaultValues).forEach((key) => {
        const entityValue = (entity as Record<string, unknown>)[key];
        if (entityValue !== undefined) {
          form.setValue(
            key as unknown as Path<Schema>,
            entityValue as PathValue<Schema, Path<Schema>>,
            { shouldValidate: true },
          );
        }
      });
    } else {
      // Reset form when no entity (creating new)
      form.reset(defaultValues);
    }
  }, [entity?.id, form, entity, defaultValues]);

  const handleDelete = async () => {
    if (!entity) {
      return;
    }

    const url = `DELETE /${modalId}/${entity.id}`;
    try {
      const service = await getService();

      const result = await service.delete(entity.id);
      logger.info(`${url} success`, result);
      closeModal(true);
    } catch (error) {
      logger.error(`${url} failed`, error);
      notificationsService.error('Failed to delete');
      closeModal();
    }
  };

  return {
    closeModal,
    form,
    formRef,
    handleDelete: entity ? handleDelete : undefined,
    isSubmitting,
    onSubmit,
  };
}
