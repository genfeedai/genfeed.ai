'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import {
  type InviteMemberSchema,
  inviteMemberSchema,
  type MemberEditSchema,
  memberEditSchema,
} from '@genfeedai/client/schemas';
import { ModalEnum } from '@genfeedai/contracts';
import type { IBrand, IRole } from '@genfeedai/contracts/interfaces';
import { closeModal } from '@helpers/ui/modal/modal.helper';
import { standardSchemaResolver } from '@hookform/resolvers/standard-schema';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import type { Brand } from '@models/organization/brand.model';
import type { ModalMemberProps } from '@props/modals/modal.props';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { OrganizationsService } from '@services/organization/organizations.service';
import Modal from '@ui/modals/modal/Modal';
import {
  getApiErrorMessage,
  hasErrorDetail,
} from '@utils/error/error-handler.util';
import { isAxiosError } from '@utils/error/json-api-status.util';
import { useEffect, useRef, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { useOrganizationRoles } from '@/hooks/data/organization/use-organization-roles/use-organization-roles';
import { useFocusFirstInput } from '@/hooks/ui/use-focus-first-input/use-focus-first-input';
import { useFormSubmitWithState } from '@/hooks/utils/use-form-submit/use-form-submit';
import EditMemberForm from './EditMemberForm';
import InviteForm from './InviteForm';

const EMPTY_ROLES: IRole[] = [];

const INVITE_DEFAULT_VALUES: InviteMemberSchema = {
  email: '',
  firstName: '',
  lastName: '',
  roleId: '',
};

export default function ModalMember({
  member,
  organizationId,
  onConfirm,
}: ModalMemberProps) {
  const { brands } = useBrand();
  const [error, setError] = useState<string | null>(null);

  const getOrganizationsService = useAuthedService((token: string) =>
    OrganizationsService.getInstance(token),
  );

  const notificationsService = NotificationsService.getInstance();

  // Invite mode reads the roles through React Query, so reopening the dialog
  // paints the role picker at once and refreshes it in the background.
  const rolesQuery = useOrganizationRoles(!member);
  const roles = rolesQuery.data ?? EMPTY_ROLES;
  const isLoadingRoles = rolesQuery.isPending;
  const defaultRoleId =
    (roles.find((role) => role.key === 'user') ?? roles[0])?.id ?? '';
  // A failed background refresh keeps the cached roles; the error only shows
  // when there are none.
  const rolesError =
    rolesQuery.error && !rolesQuery.data ? 'Failed to load roles' : null;

  // Forms for different modes
  const form = useForm<InviteMemberSchema>({
    defaultValues: INVITE_DEFAULT_VALUES,
    resolver: standardSchemaResolver(inviteMemberSchema),
  });

  const editForm = useForm<MemberEditSchema>({
    defaultValues: {
      brandIds: [],
    },
    resolver: standardSchemaResolver(memberEditSchema),
  });

  const formRef = useFocusFirstInput<HTMLFormElement>();
  const watchedBrands = useWatch({
    control: editForm.control,
    name: 'brandIds',
  });

  const closeMemberModal = (isRefreshing = false) => {
    closeModal(ModalEnum.MEMBER);
    setError(null); // Clear error when closing modal

    if (!member) {
      form.reset({ ...INVITE_DEFAULT_VALUES, roleId: defaultRoleId });
    } else {
      editForm.reset();
    }
    onConfirm(isRefreshing);
  };

  const { error: rolesLoadError } = rolesQuery;
  useEffect(() => {
    if (rolesLoadError) {
      logger.error('GET /roles failed', rolesLoadError);
    }
  }, [rolesLoadError]);

  // Pick the default role once roles are known, unless one is already chosen.
  // A refresh that drops the chosen role clears it, so the invite never sends
  // a deleted role; the operator picks again rather than getting another role
  // silently.
  const hasDefaultedRoleRef = useRef(false);
  const loadedRoles = rolesQuery.data;
  useEffect(() => {
    if (member) {
      return;
    }
    const roleId = form.getValues('roleId');
    if (!roleId) {
      if (defaultRoleId && !hasDefaultedRoleRef.current) {
        hasDefaultedRoleRef.current = true;
        form.setValue('roleId', defaultRoleId);
      }
      return;
    }
    if (loadedRoles && !loadedRoles.some((role) => role.id === roleId)) {
      form.setValue('roleId', '', { shouldValidate: true });
    }
  }, [defaultRoleId, form, loadedRoles, member]);

  useEffect(() => {
    if (member && organizationId) {
      const brandIds =
        member.brands?.map((brand: IBrand | Brand) => brand.id) || [];
      editForm.setValue('brandIds', brandIds as string[]);
    }
  }, [member, organizationId, editForm]);

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
        setError(getApiErrorMessage(error, 'Failed to send invitation'));
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
        brandIds: formData.brandIds,
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
      error={error ?? (member ? null : rolesError)}
      title={member ? 'Edit Member' : 'Invite Member'}
      onClose={() => setError(null)}
    >
      {!member ? (
        <InviteForm
          formRef={formRef}
          control={form.control}
          formState={form.formState}
          roles={roles}
          isLoadingRoles={isLoadingRoles}
          isSubmitting={isSubmitting}
          onSubmit={onSubmit}
          onSetRole={(value) => form.setValue('roleId', value)}
          onCancel={() => closeMemberModal()}
        />
      ) : (
        <EditMemberForm
          member={member}
          brands={brands as IBrand[]}
          formState={editForm.formState}
          watchedBrands={watchedBrands}
          isSubmitting={isSubmitting}
          onSubmit={onSubmit}
          getValues={editForm.getValues}
          setValue={editForm.setValue}
          onCancel={() => closeMemberModal()}
        />
      )}
    </Modal>
  );
}
