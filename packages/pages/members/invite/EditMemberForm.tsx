'use client';

import type { MemberEditSchema } from '@genfeedai/client/schemas';
import { AlertCategory, ButtonVariant } from '@genfeedai/enums';
import type { IBrand, IMember } from '@genfeedai/interfaces';
import {
  hasFormErrors,
  parseFormErrors,
} from '@helpers/ui/form-error/form-error.helper';
import Alert from '@ui/feedback/alert/Alert';
import { Button } from '@ui/primitives/button';
import { Checkbox } from '@ui/primitives/checkbox';
import type {
  FormState,
  UseFormGetValues,
  UseFormSetValue,
} from 'react-hook-form';
import { HiCheck, HiXMark } from 'react-icons/hi2';

export type EditMemberFormProps = {
  member: IMember;
  brands: IBrand[];
  formState: FormState<MemberEditSchema>;
  watchedBrands: string[];
  isSubmitting: boolean;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  getValues: UseFormGetValues<MemberEditSchema>;
  setValue: UseFormSetValue<MemberEditSchema>;
  onCancel: () => void;
};

export default function EditMemberForm({
  member,
  brands,
  formState,
  watchedBrands,
  isSubmitting,
  onSubmit,
  getValues,
  setValue,
  onCancel,
}: EditMemberFormProps) {
  return (
    <>
      <h3 className="font-bold text-lg">Edit Member Brands</h3>

      <div className="py-4">
        <p className="text-sm text-gray-400 mb-4">
          Assign accounts to <strong>{member.userFullName}</strong>
        </p>

        <form onSubmit={onSubmit} className="space-y-4">
          {hasFormErrors(formState.errors) && (
            <Alert type={AlertCategory.ERROR} className="mb-4">
              <div className="space-y-1">
                {parseFormErrors(formState.errors).map((error) => (
                  <div key={error}>{error}</div>
                ))}
              </div>
            </Alert>
          )}

          <div className="w-full mb-5">
            <div>
              <span className="text-sm capitalize font-semibold">Brands</span>
            </div>

            <div className="space-y-2 max-h-64 overflow-y-auto">
              {brands.map((brand: IBrand) => (
                <div
                  key={brand.id}
                  className="p-3 hover:bg-secondary rounded-lg"
                >
                  <Checkbox
                    name={`account-${brand.id}`}
                    label={
                      <span className="flex-1">
                        <div className="font-medium">{brand.label}</div>
                        {brand.slug && (
                          <div className="text-sm text-gray-400">
                            @{brand.slug}
                          </div>
                        )}
                      </span>
                    }
                    isChecked={watchedBrands.includes(brand.id)}
                    onChange={(e) => {
                      const currentBrands = getValues('brands');
                      if (e.target.checked) {
                        setValue('brands', [...currentBrands, brand.id]);
                      } else {
                        setValue(
                          'brands',
                          currentBrands.filter((id) => id !== brand.id),
                        );
                      }
                    }}
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button
              label={
                <>
                  <HiXMark /> Cancel
                </>
              }
              variant={ButtonVariant.GHOST}
              onClick={onCancel}
              isDisabled={isSubmitting}
            />

            <Button
              type="submit"
              label={
                <>
                  <HiCheck /> Save
                </>
              }
              variant={ButtonVariant.DEFAULT}
              isLoading={isSubmitting}
              isDisabled={isSubmitting}
            />
          </div>
        </form>
      </div>
    </>
  );
}
