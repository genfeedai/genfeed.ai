import type { ModelSchema } from '@genfeedai/client/schemas';
import {
  AlertCategory,
  ButtonSize,
  ButtonVariant,
  type ModelCategory,
  type ModelProvider,
} from '@genfeedai/enums';
import {
  hasFormErrors,
  parseFormErrors,
} from '@genfeedai/helpers/ui/form-error/form-error.helper';
import type { IModel } from '@genfeedai/interfaces';
import Alert from '@ui/feedback/alert/Alert';
import ModalActions from '@ui/modals/actions/ModalActions';
import { Button } from '@ui/primitives/button';
import FormControl from '@ui/primitives/field';
import { Input } from '@ui/primitives/input';
import { SelectField } from '@ui/primitives/select';
import type { ChangeEvent, FormEvent, RefObject } from 'react';
import type { UseFormReturn } from 'react-hook-form';

type ModalModelFormContentProps = {
  form: UseFormReturn<ModelSchema>;
  formRef: RefObject<HTMLFormElement | null>;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  isSubmitting: boolean;
  updateModalModel: (
    event: ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => void;
  cancelModalModel: () => void;
  model: IModel | undefined | null;
  modelProviders: ModelProvider[];
  modelCategories: ModelCategory[];
};

export default function ModalModelFormContent({
  form,
  formRef,
  onSubmit,
  isSubmitting,
  updateModalModel,
  cancelModalModel,
  model,
  modelProviders,
  modelCategories,
}: ModalModelFormContentProps) {
  return (
    <form ref={formRef} onSubmit={onSubmit}>
      {hasFormErrors(form.formState.errors) && (
        <Alert type={AlertCategory.ERROR} className="mb-4">
          <div className="space-y-1">
            {parseFormErrors(form.formState.errors).map((error) => (
              <div key={error}>{error}</div>
            ))}
          </div>
        </Alert>
      )}
      <FormControl label="Label">
        <Input
          type="text"
          name="label"
          control={form.control}
          onChange={updateModalModel}
          placeholder="Enter model label"
          isRequired={true}
          isDisabled={isSubmitting}
        />
      </FormControl>
      <FormControl label="Description">
        <Input
          type="text"
          name="description"
          control={form.control}
          onChange={updateModalModel}
          placeholder="Enter model description"
          isDisabled={isSubmitting}
        />
      </FormControl>
      <FormControl label="Key">
        <Input
          type="text"
          name="key"
          control={form.control}
          onChange={updateModalModel}
          placeholder="Enter model key"
          isRequired={true}
          isDisabled={isSubmitting}
        />
      </FormControl>
      <div className="grid grid-cols-2 gap-2">
        <SelectField
          name="provider"
          control={form.control}
          onChange={updateModalModel}
          isDisabled={isSubmitting}
        >
          {modelProviders.map((provider) => (
            <option key={provider} value={provider}>
              {provider}
            </option>
          ))}
        </SelectField>

        <SelectField
          name="category"
          control={form.control}
          onChange={updateModalModel}
          isDisabled={isSubmitting}
        >
          {modelCategories.map((category) => (
            <option key={category} value={category}>
              {category}
            </option>
          ))}
        </SelectField>
      </div>
      <FormControl label="Cost" className="mt-4">
        <Input
          type="number"
          name="cost"
          control={form.control}
          onChange={updateModalModel}
          placeholder="Enter model cost"
          isRequired={true}
          isDisabled={isSubmitting}
        />
      </FormControl>
      <ModalActions>
        <Button
          label="Cancel"
          variant={ButtonVariant.SECONDARY}
          onClick={cancelModalModel}
          isLoading={isSubmitting}
        />

        <Button
          type="submit"
          label={model ? 'Update' : 'Add'}
          variant={ButtonVariant.DEFAULT}
          size={ButtonSize.LG}
          className="md:h-9 md:px-4 md:py-2 mb-4 md:mb-0"
          isLoading={isSubmitting}
          isDisabled={isSubmitting || !form.formState.isValid}
        />
      </ModalActions>
    </form>
  );
}
