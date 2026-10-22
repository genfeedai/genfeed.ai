'use client';

import { ButtonSize, ButtonVariant, MemberRole } from '@genfeedai/contracts';
import { formatDate } from '@helpers/formatting/date/date.helper';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import type { MemberDetailsProps } from '@props/settings/members-list.props';
import { OrganizationsService } from '@services/organization/organizations.service';
import TableRowSummary from '@ui/display/table/TableRowSummary';
import { Button } from '@ui/primitives/button';
import { Checkbox } from '@ui/primitives/checkbox';
import { Form } from '@ui/primitives/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import { getErrorMessage } from '@utils/error/error-handler.util';
import { Pencil } from 'lucide-react';
import { useRef, useState } from 'react';

export default function MemberDetails({
  member,
  organizationId,
  actorRole,
  brands,
  roles,
  isLoadingRoles,
  rolesError,
  onLoadRoles,
  onUpdated,
}: MemberDetailsProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [roleId, setRoleId] = useState(member.roleId);
  const [brandIds, setBrandIds] = useState(
    () => member.brands?.map((brand) => brand.id) ?? [],
  );
  const [isActive, setIsActive] = useState(member.isActive);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const saving = useRef(false);
  const getService = useAuthedService((token: string) =>
    OrganizationsService.getInstance(token),
  );
  const targetRole = member.role?.key ?? member.roleKey;
  const canEdit =
    actorRole === MemberRole.OWNER ||
    (actorRole === MemberRole.ADMIN && targetRole !== MemberRole.OWNER);
  const availableRoles = roles.filter(
    (role) =>
      Object.values(MemberRole).some((key) => key === role.key) &&
      (actorRole === MemberRole.OWNER || role.key !== MemberRole.OWNER),
  );
  const selectedRole = roles.find((role) => role.id === roleId);
  const hasAllBrandAccess =
    selectedRole?.key === MemberRole.OWNER ||
    selectedRole?.key === MemberRole.ADMIN;
  // Keep assignments that aren't present in the current context rather than silently dropping them.
  const brandOptions = [
    ...brands,
    ...(member.brands ?? []).filter(
      (assigned) => !brands.some((brand) => brand.id === assigned.id),
    ),
  ];

  async function save() {
    if (saving.current || !canEdit) return;
    saving.current = true;
    setIsSaving(true);
    setError(null);
    try {
      const service = await getService();
      const updated = await service.updateOrganizationMember(
        organizationId,
        member.id,
        { roleId, brandIds, isActive },
      );
      onUpdated(updated);
      setIsEditing(false);
      setNotice('Member saved');
    } catch (error) {
      setError(
        getErrorMessage(error, 'Could not save member. Please try again.'),
      );
    } finally {
      saving.current = false;
      setIsSaving(false);
    }
  }

  return (
    <Form
      spacing="none"
      aria-label="Edit member"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <TableRowSummary
        facts={[
          {
            id: 'email',
            label: 'Email',
            value: member.userEmail ?? member.user?.email,
          },
          {
            id: 'role',
            label: 'Role',
            value: isEditing ? (
              <div className="space-y-2">
                <Select
                  value={roleId}
                  onValueChange={setRoleId}
                  disabled={isSaving || isLoadingRoles || !!rolesError}
                >
                  <SelectTrigger aria-label="Role">
                    <SelectValue placeholder="Select role" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableRoles.map((role) => (
                      <SelectItem key={role.id} value={role.id}>
                        {role.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {isLoadingRoles ? (
                  <p role="status" className="text-sm text-muted-foreground">
                    Loading roles…
                  </p>
                ) : null}
                {rolesError ? (
                  <>
                    <p role="alert" className="text-sm text-destructive">
                      {rolesError}
                    </p>
                    <Button
                      label="Retry loading roles"
                      variant={ButtonVariant.SECONDARY}
                      onClick={onLoadRoles}
                    />
                  </>
                ) : null}
              </div>
            ) : (
              (member.roleLabel ?? member.role?.label ?? member.roleKey)
            ),
          },
          {
            id: 'brands',
            label: 'Brands',
            value: isEditing ? (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">
                  {hasAllBrandAccess
                    ? 'Owners and admins can access all brands. Assignments are kept for future role changes.'
                    : 'No selection gives access to all brands.'}
                </p>
                <div className="max-h-64 space-y-2 overflow-y-auto">
                  {brandOptions.map((brand) => (
                    <Checkbox
                      key={brand.id}
                      label={brand.label}
                      isChecked={brandIds.includes(brand.id)}
                      isDisabled={isSaving}
                      onCheckedChange={(checked) =>
                        setBrandIds((current) =>
                          checked === true
                            ? [...current, brand.id]
                            : current.filter((id) => id !== brand.id),
                        )
                      }
                    />
                  ))}
                </div>
              </div>
            ) : targetRole === MemberRole.OWNER ||
              targetRole === MemberRole.ADMIN ||
              !member.brands?.length ? (
              'All brands'
            ) : (
              member.brands.map((brand) => brand.label).join(', ')
            ),
          },
          {
            id: 'active',
            label: 'Status',
            value: isEditing ? (
              <Checkbox
                label="Active member"
                isChecked={isActive}
                isDisabled={isSaving}
                onCheckedChange={(checked) => setIsActive(checked === true)}
              />
            ) : member.isActive ? (
              'Active'
            ) : (
              'Inactive'
            ),
          },
          {
            id: 'joined',
            label: 'Joined',
            value: member.createdAt ? formatDate(member.createdAt) : undefined,
          },
        ]}
      >
        {isEditing ? (
          <>
            {error ? (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Button
                type="submit"
                label="Save"
                isLoading={isSaving}
                isDisabled={
                  isSaving ||
                  isLoadingRoles ||
                  !!rolesError ||
                  !availableRoles.some((role) => role.id === roleId)
                }
              />
              <Button
                label="Cancel"
                variant={ButtonVariant.SECONDARY}
                isDisabled={isSaving}
                onClick={() => {
                  setIsEditing(false);
                  setError(null);
                }}
              />
            </div>
          </>
        ) : (
          <>
            {notice ? (
              <p role="status" className="text-sm text-muted-foreground">
                {notice}
              </p>
            ) : null}
            {canEdit ? (
              <Button
                label="Edit member"
                size={ButtonSize.SM}
                variant={ButtonVariant.SECONDARY}
                icon={<Pencil className="size-3.5" />}
                onClick={() => {
                  setRoleId(member.roleId);
                  setBrandIds(member.brands?.map((brand) => brand.id) ?? []);
                  setIsActive(member.isActive);
                  setError(null);
                  setNotice(null);
                  setIsEditing(true);
                  onLoadRoles();
                }}
              />
            ) : null}
          </>
        )}
      </TableRowSummary>
    </Form>
  );
}
