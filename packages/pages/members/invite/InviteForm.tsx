'use client';

import type { InviteMemberSchema } from '@genfeedai/client/schemas';
import { AlertCategory, ButtonVariant } from '@genfeedai/enums';
import type { IRole } from '@genfeedai/interfaces';
import {
  hasFormErrors,
  parseFormErrors,
} from '@helpers/ui/form-error/form-error.helper';
import Alert from '@ui/feedback/alert/Alert';
import ModalActions from '@ui/modals/actions/ModalActions';
import { Button } from '@ui/primitives/button';
import FormControl from '@ui/primitives/field';
import { Input } from '@ui/primitives/input';
import { SelectField } from '@ui/primitives/select';
import type { RefObject } from 'react';
import type { Control, FormState } from 'react-hook-form';
import { HiUserPlus } from 'react-icons/hi2';

export type InviteFormProps = {
  formRef: RefObject<HTMLFormElement | null>;
  control: Control<InviteMemberSchema>;
  formState: FormState<InviteMemberSchema>;
  roles: IRole[];
  isLoadingRoles: boolean;
  isSubmitting: boolean;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  onSetRole: (value: string) => void;
  onCancel: () => void;
};

export default function InviteForm({
  formRef,
  control,
  formState,
  roles,
  isLoadingRoles,
  isSubmitting,
  onSubmit,
  onSetRole,
  onCancel,
}: InviteFormProps) {
  return (
    <form ref={formRef} onSubmit={onSubmit} className="space-y-4">
      {hasFormErrors(formState.errors) && (
        <Alert type={AlertCategory.ERROR} className="mb-4">
          <div className="space-y-1">
            {parseFormErrors(formState.errors).map((error) => (
              <div key={error}>{error}</div>
            ))}
          </div>
        </Alert>
      )}

      <FormControl label="Email Address">
        <Input
          name="email"
          type="email"
          placeholder="member@example.com"
          control={control}
        />
      </FormControl>

      <div className="grid grid-cols-2 gap-4">
        <FormControl label="First Name">
          <Input name="firstName" placeholder="John" control={control} />
        </FormControl>

        <FormControl label="Last Name">
          <Input name="lastName" placeholder="Doe" control={control} />
        </FormControl>
      </div>

      <FormControl label="Role">
        <SelectField
          name="role"
          control={control}
          onChange={(e) => onSetRole(e.target.value)}
          isDisabled={isLoadingRoles}
        >
          {roles.map((role) => (
            <option key={role.id} value={role.id}>
              {role.label}
            </option>
          ))}
        </SelectField>
      </FormControl>

      <ModalActions>
        <Button
          label="Cancel"
          variant={ButtonVariant.SECONDARY}
          onClick={onCancel}
        />

        <Button
          type="submit"
          label={
            <>
              <HiUserPlus /> Send Invitation
            </>
          }
          variant={ButtonVariant.DEFAULT}
          isLoading={isSubmitting}
          isDisabled={!formState.isValid || isLoadingRoles}
        />
      </ModalActions>
    </form>
  );
}
