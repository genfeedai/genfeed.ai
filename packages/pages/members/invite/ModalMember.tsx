'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import {
  type InviteMemberSchema,
  inviteMemberSchema,
  type MemberEditSchema,
  memberEditSchema,
} from '@genfeedai/client/schemas';
import { AlertCategory, ModalEnum } from '@genfeedai/enums';
import type { IBrand, IRole } from '@genfeedai/interfaces';
import {
  hasFormErrors,
  parseFormErrors,
} from '@helpers/ui/form-error/form-error.helper';
import { closeModal } from '@helpers/ui/modal/modal.helper';
import { standardSchemaResolver } from '@hookform/resolvers/standard-schema';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useFocusFirstInput } from '@hooks/ui/use-focus-first-input/use-focus-first-input';
import { useFormSubmitWithState } from '@hooks/utils/use-form-submit/use-form-submit';
import type { Brand } from '@models/organization/brand.model';
import type { ModalMemberProps } from '@props/modals/modal.props';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { OrganizationsService } from '@services/organization/organizations.service';
import { RolesService } from '@services/organization/roles.service';
import Alert from '@ui/feedback/alert/Alert';
import ModalActions from '@ui/modals/actions/ModalActions';
import Modal from '@ui/modals/modal/Modal';
import { Button } from '@ui/primitives/button';
import { Checkbox } from '@ui/primitives/checkbox';
import FormControl from '@ui/primitives/field';
import { Input } from '@ui/primitives/input';
import { SelectField } from '@ui/primitives/select';
import {
  getErrorMessage,
  hasErrorDetail,
  isAxiosError,
} from '@utils/error/error-handler.util';
import { useEffect, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { HiCheck, HiUserPlus, HiXMark } from 'react-icons/hi2';

export default function ModalMember({
  member,
  organizationId,
  onConfirm,
}: ModalMemberProps) {
  const { brands } = useBrand();
  const [error, setError] = useState<string | null>(null);

  const getRolesService = useAuthedService((token: string) =>
    RolesService.getInstance(token),
  );

  const getOrganizationsService = useAuthedService((token: string) =>
    OrganizationsService.getInstance(token),
  );

  const notificationsService = NotificationsService.getInstance();

  // States for invite mode
  const [roles, setRoles] = useState<IRole[]>([]);
  const [isLoadingRoles, setIsLoadingRoles] = useState(true);

  // Forms for different modes
  const form = useForm<InviteMemberSchema>({
    defaultValues: {
      email: '',
      firstName: '',
      lastName: '',
      role: '',
    },
    resolver: standardSchemaResolver(inviteMemberSchema),
  });

  const editForm = useForm<MemberEditSchema>({
    defaultValues: {
      brands: [],
    },
    resolver: standardSchemaResolver(memberEditSchema),
  });

  const formRef = useFocusFirstInput<HTMLFormElement>();
  const watchedBrands = useWatch({ control: editForm.control, name: 'brands' });

  const closeMemberModal = (isRefreshing = false) => {
    closeModal(ModalEnum.MEMBER);
    setError(null); // Clear error when closing modal

    if (!member) {
      form.reset();
    } else {
      editForm.reset();
    }
    onConfirm(isRefreshing);
  };

  useEffect(() => {
    if (!member) {
      const findAllRoles = async () => {
        const url = 'GET /roles';
        setIsLoadingRoles(true);

        try {
          const service = await getRolesService();
          const data = await service.findAll();
          setRoles(data);

          if (data.length > 0) {
            const defaultRole = data.find((r) => r.key === 'user') || data[0];
            form.setValue('role', defaultRole.id);
          }
        } catch (error) {
          logger.error(`${url} failed`, error);
          setError('Failed to load roles');
        }

        setIsLoadingRoles(false);
      };

      findAllRoles();
    } else if (!!member && organizationId) {
      if (member) {
        const brandIds =
          member.brands?.map((brand: IBrand | Brand) => brand.id) || [];
        editForm.setValue('brands', brandIds as string[]);
      }
    }
  }, [member, organizationId, form, editForm, getRolesService]);

  const handleInviteSubmit = async () => {
    const values = form.getValues();
    const url = `POST /organizations/${organizationId}/invite`;
    setError(null); // Clear any previous errors

    try {
      const service = await getOrganizationsService();

      await service.inviteMember(organizationId, values);

      notificationsService.success('Invitation sent successfully');

      closeMemberModal(true);
    } catch (error: unknown) {
      logger.error(`${url} failed`, error);

      if (hasErrorDetail(error, 'seat limit')) {
        return setError(
          'Credits have been deducted for an additional seat. Please try sending the invitation again.',
        );
      }

      if (isAxiosError(error)) {
        setError(getErrorMessage(error, 'Failed to send invitation'));
        return;
      }

      if (error instanceof Error) {
        setError(error.message);
      } else {
        setError('Failed to send invitation');
      }
    }
  };

  const handleEditSubmit = async () => {
    if (!member) return;

    const url = 'PATCH /organizations/:id/members/:memberId';
    setError(null); // Clear any previous errors

    try {
      const service = await getOrganizationsService();
      const formData = editForm.getValues();

      await service.updateOrganizationMember(organizationId, member.id, {
        brands: formData.brands,
      });

      logger.info(`${url} success`);
      notificationsService.success('Member updated successfully');

      closeMemberModal(true);
    } catch (error) {
      logger.error(`${url} failed`, error);
      setError('Failed to update member');
    }
  };

  const { isSubmitting, onSubmit } = useFormSubmitWithState(
    !member ? handleInviteSubmit : handleEditSubmit,
  );

  // Component can handle both invite and edit modes

  return (
    <Modal
      id={ModalEnum.MEMBER}
      error={error}
      title={member ? 'Edit Member' : 'Invite Member'}
      onClose={() => setError(null)}
    >
      {!member ? (
        <form ref={formRef} onSubmit={onSubmit} className="space-y-4">
          {hasFormErrors(form.formState.errors) && (
            <Alert type={AlertCategory.ERROR} className="alert-error mb-4">
              <div className="space-y-1">
                {parseFormErrors(form.formState.errors).map((error, index) => (
                  <div key={index}>{error}</div>
                ))}
              </div>
            </Alert>
          )}

          <FormControl label="Email Address">
            <Input
              name="email"
              type="email"
              placeholder="member@example.com"
              control={form.control}
            />
          </FormControl>

          <div className="grid grid-cols-2 gap-4">
            <FormControl label="First Name">
              <Input
                name="firstName"
                placeholder="John"
                control={form.control}
              />
            </FormControl>

            <FormControl label="Last Name">
              <Input name="lastName" placeholder="Doe" control={form.control} />
            </FormControl>
          </div>

          <FormControl label="Role">
            <SelectField
              name="role"
              control={form.control}
              onChange={(e) => form.setValue('role', e.target.value)}
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
              className="btn-secondary"
              onClick={() => closeMemberModal()}
            />

            <Button
              type="submit"
              label={
                <>
                  <HiUserPlus /> Send Invitation
                </>
              }
              className="btn-primary"
              isLoading={isSubmitting}
              isDisabled={!form.formState.isValid || isLoadingRoles}
            />
          </ModalActions>
        </form>
      ) : (
        <>
          <h3 className="font-bold text-lg">Edit Member Brands</h3>

          <div className="py-4">
            <p className="text-sm text-gray-400 mb-4">
              Assign accounts to <strong>{member?.userFullName}</strong>
            </p>

            <form onSubmit={onSubmit} className="space-y-4">
              {hasFormErrors(editForm.formState.errors) && (
                <Alert type={AlertCategory.ERROR} className="alert-error mb-4">
                  <div className="space-y-1">
                    {parseFormErrors(editForm.formState.errors).map(
                      (error, index) => (
                        <div key={index}>{error}</div>
                      ),
                    )}
                  </div>
                </Alert>
              )}

              <div className="form-control w-full mb-5">
                <label className="label">
                  <span className="label-text capitalize font-semibold">
                    Brands
                  </span>
                </label>

                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {brands.map((brand: IBrand) => (
                    <div
                      key={brand.id}
                      className="p-3 hover:bg-base-200 rounded-lg"
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
                          const currentBrands = editForm.getValues('brands');
                          if (e.target.checked) {
                            editForm.setValue('brands', [
                              ...currentBrands,
                              brand.id,
                            ]);
                          } else {
                            editForm.setValue(
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

              <div className="modal-action">
                <Button
                  label={
                    <>
                      <HiXMark /> Cancel
                    </>
                  }
                  className="btn-ghost"
                  onClick={() => closeMemberModal()}
                  isDisabled={isSubmitting}
                />

                <Button
                  type="submit"
                  label={
                    <>
                      <HiCheck /> Save
                    </>
                  }
                  className="btn-primary"
                  isLoading={isSubmitting}
                  isDisabled={isSubmitting}
                />
              </div>
            </form>
          </div>
        </>
      )}
    </Modal>
  );
}
