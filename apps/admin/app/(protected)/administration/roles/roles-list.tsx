'use client';

import ButtonRefresh from '@components/buttons/refresh/button-refresh/ButtonRefresh';
import { LazyModalRole } from '@components/lazy/LazyModal';
import { ButtonSize, ButtonVariant, ModalEnum } from '@genfeedai/enums';
import type { IRole } from '@genfeedai/interfaces';
import { openModal } from '@helpers/ui/modal/modal.helper';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import type { TableAction } from '@props/ui/display/table.props';
import { useConfirmModal } from '@providers/global-modals/global-modals.provider';
import { logger } from '@services/core/logger.service';
import { RolesService } from '@services/organization/roles.service';
import AppTable from '@ui/display/table/Table';
import Container from '@ui/layout/container/Container';
import { Button } from '@ui/primitives/button';
import { useCallback, useEffect, useState } from 'react';
import {
  HiOutlineShieldCheck,
  HiPencil,
  HiPlus,
  HiTrash,
} from 'react-icons/hi2';

export default function RolesList() {
  const { openConfirm } = useConfirmModal();
  const getRolesService = useAuthedService((token: string) =>
    RolesService.getInstance(token),
  );

  const [roles, setRoles] = useState<IRole[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedRole, setSelectedRole] = useState<IRole | null>(null);

  const columns = [
    { header: 'Label', key: 'label' },
    { className: 'font-mono text-sm', header: 'Key', key: 'key' },
    {
      header: 'Color',
      key: 'primaryColor',
      render: (role: IRole) =>
        role.primaryColor ? (
          <div className="flex items-center gap-2">
            <div
              className="w-4 h-4 rounded-full border border-white/[0.08]"
              style={{ backgroundColor: role.primaryColor }}
            />
            <span className="text-sm font-mono">{role.primaryColor}</span>
          </div>
        ) : (
          <span className="text-muted-foreground">No color</span>
        ),
    },
  ];

  const actions: TableAction<IRole>[] = [
    {
      icon: <HiPencil />,
      onClick: (r: IRole) => openRoleModal(ModalEnum.ROLE, r),
      size: ButtonSize.SM,
      tooltip: 'Edit',
      variant: ButtonVariant.DEFAULT,
    },
    {
      icon: <HiTrash />,
      onClick: (r: IRole) => {
        setSelectedRole(r);
        openConfirm({
          confirmLabel: 'Delete',
          isError: true,
          label: 'Delete Role',
          message: `Are you sure you want to delete "${r.label}"? This action cannot be undone.`,
          onConfirm: () => handleDelete(r),
        });
      },
      size: ButtonSize.SM,
      tooltip: 'Delete',
      variant: ButtonVariant.DESTRUCTIVE,
    },
  ];

  const loadRoles = useCallback(
    async (refresh = false) => {
      if (!refresh) {
        setIsLoading(true);
      }
      setIsRefreshing(refresh);

      try {
        const service = await getRolesService();
        const data = await service.findAll();
        setRoles(data);
      } catch (error) {
        logger.error('GET /roles failed', error);
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [getRolesService],
  );

  useEffect(() => {
    loadRoles();
  }, [loadRoles]);

  const openRoleModal = (modalId: ModalEnum, role?: IRole) => {
    setSelectedRole(role ?? null);
    openModal(modalId);
  };

  const handleDelete = async (role: IRole) => {
    try {
      const service = await getRolesService();
      await service.delete(role.id);
    } catch (error) {
      logger.error(`DELETE /roles/${role.id} failed`, error);
    } finally {
      loadRoles(true);
    }
  };

  return (
    <Container
      label="Roles"
      description="Manage user roles, permissions, and access control settings"
      icon={HiOutlineShieldCheck}
      right={
        <>
          <ButtonRefresh
            onClick={() => loadRoles(true)}
            isRefreshing={isRefreshing}
          />

          <Button
            label={
              <>
                <HiPlus /> Role
              </>
            }
            variant={ButtonVariant.DEFAULT}
            onClick={() => openRoleModal(ModalEnum.ROLE)}
          />
        </>
      }
    >
      <AppTable<IRole>
        items={roles}
        columns={columns}
        actions={actions}
        isLoading={isLoading}
        getRowKey={(item: IRole) => item.id}
        emptyLabel="No roles found"
      />

      <LazyModalRole role={selectedRole} onConfirm={() => loadRoles(true)} />
    </Container>
  );
}
