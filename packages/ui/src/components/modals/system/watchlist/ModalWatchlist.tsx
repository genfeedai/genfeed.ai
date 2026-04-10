import {
  type WatchlistSchema,
  watchlistSchema,
} from '@genfeedai/client/schemas';
import { useBrand } from '@genfeedai/contexts/user/brand-context/brand-context';
import {
  AlertCategory,
  ButtonVariant,
  ModalEnum,
  PageScope,
  Platform,
} from '@genfeedai/enums';
import {
  hasFormErrors,
  parseFormErrors,
} from '@genfeedai/helpers/ui/form-error/form-error.helper';
import { useCrudModal } from '@genfeedai/hooks/ui/use-crud-modal/use-crud-modal';
import type { IBrand, IWatchlist } from '@genfeedai/interfaces';
import type { ModalWatchlistProps } from '@genfeedai/props/components/modal-watchlist.props';
import { WatchlistService } from '@genfeedai/services/analytics/watchlist.service';
import Alert from '@ui/feedback/alert/Alert';
import ModalActions from '@ui/modals/actions/ModalActions';
import Modal from '@ui/modals/modal/Modal';
import { Button } from '@ui/primitives/button';
import FormControl from '@ui/primitives/field';
import { Input } from '@ui/primitives/input';
import { SelectField } from '@ui/primitives/select';
import { Textarea } from '@ui/primitives/textarea';
import { type ChangeEvent, useEffect } from 'react';

export default function ModalWatchlist({
  item,
  onConfirm,
  scope = PageScope.BRAND,
  brandId: propBrandId,
}: ModalWatchlistProps) {
  const { brands, brandId } = useBrand();

  const { form, formRef, isSubmitting, onSubmit, closeModal, handleDelete } =
    useCrudModal<IWatchlist, WatchlistSchema>({
      defaultValues: {
        brand: scope === PageScope.BRAND ? propBrandId || brandId : '',
        category: '',
        handle: '',
        name: '',
        notes: '',
        platform: Platform.INSTAGRAM,
      },
      entity: item || null,
      modalId: ModalEnum.WATCHLIST,
      onConfirm: (isRefreshing) => {
        onConfirm(isRefreshing || false);
      },
      schema: watchlistSchema,
      serviceFactory: (token) => WatchlistService.getInstance(token),
    });

  // Populate form when editing
  useEffect(() => {
    if (item) {
      form.setValue('name', item.name);
      form.setValue('platform', item.platform);
      form.setValue('handle', item.handle);
      form.setValue('category', item.category ?? '');
      form.setValue('notes', item.notes ?? '');
      form.setValue(
        'brand',
        typeof item.brand === 'string' ? item.brand : item.brand.id,
      );
    } else {
      // Set default brand for new item
      if (scope === PageScope.BRAND && brandId) {
        form.setValue('brand', brandId);
      }
    }
  }, [item, form, scope, brandId]);

  const handleChange = (
    e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
  ) => {
    const { name, value } = e.target;
    // Remove @ prefix from handle automatically
    if (name === 'handle') {
      const cleanedValue = value.startsWith('@') ? value.slice(1) : value;
      form.setValue(name as keyof WatchlistSchema, cleanedValue, {
        shouldValidate: true,
      });
    } else {
      form.setValue(name as keyof WatchlistSchema, value, {
        shouldValidate: true,
      });
    }
  };

  const handleCancel = () => {
    closeModal();
  };

  return (
    <Modal
      id={ModalEnum.WATCHLIST}
      title={item ? 'Edit Creator' : 'Track Creator'}
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

        <FormControl label="Creator/Brand Name">
          <Input
            type="text"
            name="name"
            control={form.control}
            onChange={handleChange}
            placeholder="Enter name (e.g., MrBeast, Nike)"
            isRequired={true}
            isDisabled={isSubmitting}
          />
        </FormControl>

        <FormControl label="Platform">
          <SelectField
            name="platform"
            control={form.control}
            onChange={handleChange}
            isRequired={true}
            isDisabled={isSubmitting}
          >
            <option value={Platform.INSTAGRAM}>Instagram</option>
            <option value={Platform.TIKTOK}>TikTok</option>
            <option value={Platform.YOUTUBE}>YouTube</option>
            <option value={Platform.TWITTER}>X (Twitter)</option>
          </SelectField>
        </FormControl>

        <FormControl label="Handle">
          <Input
            type="text"
            name="handle"
            control={form.control}
            onChange={handleChange}
            placeholder="username (without @)"
            isRequired={true}
            isDisabled={isSubmitting}
          />
          <p className="text-xs text-muted-foreground mt-1">
            Enter the username without the @ symbol
          </p>
        </FormControl>

        <FormControl label="Category">
          <Input
            type="text"
            name="category"
            control={form.control}
            onChange={handleChange}
            placeholder="e.g., Direct Competitor, Inspiration, Industry Leader"
            isDisabled={isSubmitting}
          />
        </FormControl>

        <FormControl label="Notes">
          <Textarea
            name="notes"
            control={form.control}
            onChange={handleChange}
            placeholder="Add notes about this creator..."
            isDisabled={isSubmitting}
          />
        </FormControl>

        {scope === PageScope.BRAND && brands.length > 0 && (
          <FormControl label="Brand">
            <SelectField
              name="brand"
              control={form.control}
              onChange={handleChange}
              isDisabled={isSubmitting}
            >
              <option value="">Select a brand</option>
              {brands.map((brand: IBrand) => (
                <option key={brand.id} value={brand.id}>
                  {brand.label}
                </option>
              ))}
            </SelectField>
          </FormControl>
        )}

        <ModalActions>
          <Button
            label="Cancel"
            variant={ButtonVariant.SECONDARY}
            onClick={handleCancel}
            isLoading={isSubmitting}
          />

          {item && (
            <Button
              label="Delete"
              variant={ButtonVariant.DESTRUCTIVE}
              onClick={handleDelete}
              isLoading={isSubmitting}
            />
          )}

          <Button
            type="submit"
            label={item ? 'Update' : 'Add to Watchlist'}
            variant={ButtonVariant.DEFAULT}
            isLoading={isSubmitting}
            isDisabled={isSubmitting || !form.formState.isValid}
          />
        </ModalActions>
      </form>
    </Modal>
  );
}
