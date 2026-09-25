import type { ModelSchema } from '@genfeedai/client/schemas';
import {
  AlertCategory,
  ButtonSize,
  ButtonVariant,
  type ModelCategory,
  type ModelProvider,
} from '@genfeedai/contracts';
import type {
  IModel,
  IModelProviderContracts,
} from '@genfeedai/contracts/interfaces';
import {
  hasFormErrors,
  parseFormErrors,
} from '@genfeedai/helpers/ui/form-error/form-error.helper';
import {
  getModelCategoryBadgeClass,
  getModelProviderBadgeClass,
  getModelProviderLabel,
} from '@genfeedai/helpers/ui/model-badge.helper';
import Badge from '@ui/display/badge/Badge';
import Alert from '@ui/feedback/alert/Alert';
import ModalActions from '@ui/modals/actions/ModalActions';
import { Button } from '@ui/primitives/button';
import FormControl from '@ui/primitives/field';
import { Form } from '@ui/primitives/form';
import { Input } from '@ui/primitives/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import { useTranslations } from 'next-intl';
import type { ChangeEvent, FormEvent, RefObject } from 'react';
import type { UseFormReturn } from 'react-hook-form';
import ModelProviderContractDetails from './ModelProviderContractDetails';

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
  providerContracts?: IModelProviderContracts;
  isProviderContractsError: boolean;
  isProviderContractsLoading: boolean;
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
  providerContracts,
  isProviderContractsError,
  isProviderContractsLoading,
}: ModalModelFormContentProps) {
  const selectedProvider = form.watch('provider');
  const selectedCategory = form.watch('category');
  const translate = useTranslations('ui.modelForm');

  return (
    <Form ref={formRef} onSubmit={onSubmit}>
      {hasFormErrors(form.formState.errors) && (
        <Alert type={AlertCategory.ERROR}>
          <div className="space-y-1">
            {parseFormErrors(form.formState.errors).map((error) => (
              <div key={error}>{error}</div>
            ))}
          </div>
        </Alert>
      )}
      <FormControl label={translate('label.label')}>
        <Input
          type="text"
          name="label"
          control={form.control}
          onChange={updateModalModel}
          placeholder={translate('label.placeholder')}
          isRequired={true}
          isDisabled={isSubmitting}
        />
      </FormControl>
      <FormControl label={translate('description.label')}>
        <Input
          type="text"
          name="description"
          control={form.control}
          onChange={updateModalModel}
          placeholder={translate('description.placeholder')}
          isDisabled={isSubmitting}
        />
      </FormControl>
      <FormControl label={translate('key.label')}>
        <Input
          type="text"
          name="key"
          control={form.control}
          onChange={updateModalModel}
          placeholder={translate('key.placeholder')}
          isRequired={true}
          isDisabled={isSubmitting}
        />
      </FormControl>
      <div className="grid grid-cols-2 gap-2">
        <FormControl label={translate('provider.label')}>
          <Select
            disabled={isSubmitting}
            name="provider"
            value={selectedProvider}
            onValueChange={(value) =>
              updateModalModel({
                currentTarget: { name: 'provider', value },
                target: { name: 'provider', value },
              } as ChangeEvent<HTMLSelectElement>)
            }
          >
            <SelectTrigger aria-label={translate('provider.label')}>
              <SelectValue placeholder={translate('provider.placeholder')} />
            </SelectTrigger>
            <SelectContent>
              {modelProviders.map((provider) => (
                <SelectItem key={provider} value={provider}>
                  <Badge
                    className={`border text-xs uppercase ${getModelProviderBadgeClass(provider)}`}
                  >
                    {getModelProviderLabel(provider)}
                  </Badge>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormControl>

        <FormControl label={translate('category.label')}>
          <Select
            disabled={isSubmitting}
            name="category"
            value={selectedCategory}
            onValueChange={(value) =>
              updateModalModel({
                currentTarget: { name: 'category', value },
                target: { name: 'category', value },
              } as ChangeEvent<HTMLSelectElement>)
            }
          >
            <SelectTrigger aria-label={translate('category.label')}>
              <SelectValue placeholder={translate('category.placeholder')} />
            </SelectTrigger>
            <SelectContent>
              {modelCategories.map((category) => (
                <SelectItem key={category} value={category}>
                  <Badge
                    className={`border text-xs uppercase ${getModelCategoryBadgeClass(category)}`}
                  >
                    {category}
                  </Badge>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormControl>
      </div>
      <FormControl label={translate('cost.label')}>
        <Input
          type="number"
          name="cost"
          control={form.control}
          onChange={updateModalModel}
          placeholder={translate('cost.placeholder')}
          isRequired={true}
          isDisabled={isSubmitting}
        />
      </FormControl>
      {model && (
        <ModelProviderContractDetails
          contracts={providerContracts}
          isError={isProviderContractsError}
          isLoading={isProviderContractsLoading}
        />
      )}
      <ModalActions>
        <Button
          label={translate('cancel')}
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
    </Form>
  );
}
