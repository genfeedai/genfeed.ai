'use client';

import ButtonRefresh from '@components/buttons/refresh/button-refresh/ButtonRefresh';
import { ButtonVariant } from '@genfeedai/enums';
import type { IEC2Instance, IFleetHealthResponse } from '@genfeedai/interfaces';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import type { TableColumn } from '@props/ui/display/table.props';
import { useConfirmModal } from '@providers/global-modals/global-modals.provider';
import { AdminFleetService } from '@services/admin/fleet.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { useQuery } from '@tanstack/react-query';
import Badge from '@ui/display/badge/Badge';
import Container from '@ui/layout/container/Container';
import { Button } from '@ui/primitives/button';
import { useCallback, useEffect, useRef, useState } from 'react';
import { HiOutlineServerStack, HiPlay, HiStop } from 'react-icons/hi2';
import CloudFrontSection from './CloudFrontSection';
import EC2InstancesSection from './EC2InstancesSection';
import FleetServicesSection from './FleetServicesSection';

const STATE_BADGE_COLORS = {
  pending: 'bg-warning/10 text-warning',
  running: 'bg-success/10 text-success',
  stopped: 'bg-error/10 text-error',
  stopping: 'bg-warning/10 text-warning',
  terminated: 'bg-foreground/5 text-foreground/40',
} as const;

const ROLE_BADGE_COLORS = {
  images: 'bg-violet-500/10 text-violet-500',
  training: 'bg-amber-500/10 text-amber-500',
  videos: 'bg-blue-500/10 text-blue-500',
  voices: 'bg-emerald-500/10 text-emerald-500',
} as const;

const POLL_INTERVAL_MS = 30_000;

export default function InfrastructurePage() {
  const notificationsService = NotificationsService.getInstance();
  const { openConfirm } = useConfirmModal();

  const getFleetService = useAuthedService((token: string) =>
    AdminFleetService.getInstance(token),
  );

  const [actioningInstance, setActioningInstance] = useState<string | null>(
    null,
  );
  const [isActioningAll, setIsActioningAll] = useState(false);
  const [isInvalidating, setIsInvalidating] = useState(false);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const {
    data: instances,
    isLoading: isLoadingInstances,
    isFetching: isFetchingInstances,
    error: instancesError,
    refetch: refreshInstances,
  } = useQuery<IEC2Instance[]>({
    queryKey: ['fleet-ec2-status'],
    queryFn: async () => {
      const service = await getFleetService();
      return service.getEC2Status();
    },
  });

  const isRefreshingInstances = isFetchingInstances && !isLoadingInstances;

  const {
    data: fleetHealth,
    isLoading: isLoadingFleet,
    isFetching: isFetchingFleet,
    error: fleetError,
    refetch: refreshFleet,
  } = useQuery<IFleetHealthResponse>({
    queryKey: ['fleet-health'],
    queryFn: async () => {
      const service = await getFleetService();
      return service.getFleetHealth();
    },
  });

  useEffect(() => {
    if (instancesError) {
      logger.error(
        'GET /admin/fleet/infrastructure/ec2/status failed',
        instancesError,
      );
    }
  }, [instancesError]);

  useEffect(() => {
    if (fleetError) {
      logger.error(
        'GET /admin/fleet/infrastructure/fleet/health failed',
        fleetError,
      );
    }
  }, [fleetError]);

  useEffect(() => {
    pollingRef.current = setInterval(() => {
      void refreshFleet();
    }, POLL_INTERVAL_MS);

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [refreshFleet]);

  const handleEC2Action = useCallback(
    async (instanceId: string, action: 'start' | 'stop') => {
      setActioningInstance(instanceId);

      try {
        const service = await getFleetService();
        await service.ec2Action(instanceId, action);

        notificationsService.success(
          `Instance ${action === 'start' ? 'starting' : 'stopping'}...`,
        );

        setTimeout(() => refreshInstances(), 2000);
      } catch (error) {
        logger.error(
          `POST /admin/fleet/infrastructure/ec2/action failed`,
          error,
        );
        notificationsService.error(`Failed to ${action} instance`);
      } finally {
        setActioningInstance(null);
      }
    },
    [getFleetService, notificationsService, refreshInstances],
  );

  const handleInvalidateCloudFront = useCallback(() => {
    openConfirm({
      confirmLabel: 'Invalidate',
      isError: false,
      label: 'Invalidate CloudFront Cache',
      message:
        'This will invalidate the CloudFront cache for all paths. Are you sure?',
      onConfirm: async () => {
        setIsInvalidating(true);

        try {
          const service = await getFleetService();
          await service.invalidateCloudFront(undefined, ['/*']);

          notificationsService.success('CloudFront cache invalidation started');
        } catch (error) {
          logger.error(
            'POST /admin/fleet/infrastructure/cloudfront/invalidate failed',
            error,
          );
          notificationsService.error('Failed to invalidate CloudFront cache');
        } finally {
          setIsInvalidating(false);
        }
      },
    });
  }, [getFleetService, notificationsService, openConfirm]);

  const handleEC2ActionAll = useCallback(
    async (action: 'start' | 'stop') => {
      setIsActioningAll(true);

      try {
        const service = await getFleetService();
        const result = await service.ec2ActionAll(action);
        const successCount = result.results.filter(
          (item) => item.success,
        ).length;
        const failureCount = result.results.length - successCount;

        notificationsService.success(
          `${successCount} instance(s) ${action === 'start' ? 'starting' : 'stopping'}`,
        );

        if (failureCount > 0) {
          notificationsService.error(
            `${failureCount} instance action(s) failed`,
          );
        }

        void refreshInstances();
      } catch (error) {
        logger.error(
          'POST /admin/fleet/infrastructure/ec2/action-all failed',
          error,
        );
        notificationsService.error(`Failed to ${action} fleet`);
      } finally {
        setIsActioningAll(false);
      }
    },
    [getFleetService, notificationsService, refreshInstances],
  );

  const ec2Columns: TableColumn<IEC2Instance>[] = [
    { header: 'Name', key: 'name' },
    {
      header: 'Role',
      key: 'role',
      render: (instance: IEC2Instance) => (
        <Badge
          className={
            ROLE_BADGE_COLORS[
              instance.role as keyof typeof ROLE_BADGE_COLORS
            ] ?? 'bg-foreground/5 text-foreground/60'
          }
        >
          {instance.role}
        </Badge>
      ),
    },
    {
      header: 'State',
      key: 'state',
      render: (instance: IEC2Instance) => (
        <Badge
          className={
            STATE_BADGE_COLORS[
              instance.state as keyof typeof STATE_BADGE_COLORS
            ] ?? 'bg-foreground/5 text-foreground/60'
          }
        >
          {instance.state}
        </Badge>
      ),
    },
    { header: 'Type', key: 'instanceType' },
    { header: 'Instance ID', key: 'instanceId' },
    {
      header: 'Actions',
      key: 'instanceId',
      render: (instance: IEC2Instance) => {
        const isActioning = actioningInstance === instance.instanceId;
        const canStart = instance.state === 'stopped';
        const canStop = instance.state === 'running';

        return (
          <div className="flex items-center gap-2">
            <Button
              variant={ButtonVariant.UNSTYLED}
              withWrapper={false}
              className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded bg-success/10 text-success hover:bg-success/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              isDisabled={!canStart || isActioning}
              onClick={() => handleEC2Action(instance.instanceId, 'start')}
            >
              <HiPlay className="size-3.5" />
              Start
            </Button>

            <Button
              variant={ButtonVariant.UNSTYLED}
              withWrapper={false}
              className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded bg-error/10 text-error hover:bg-error/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              isDisabled={!canStop || isActioning}
              onClick={() => handleEC2Action(instance.instanceId, 'stop')}
            >
              <HiStop className="size-3.5" />
              Stop
            </Button>
          </div>
        );
      },
    },
  ];

  const handleRefreshAll = useCallback(() => {
    void refreshInstances();
    void refreshFleet();
  }, [refreshInstances, refreshFleet]);

  const fleetInstances = fleetHealth?.instances ?? [];
  const isRefreshingFleet = isFetchingFleet && !isLoadingFleet;

  return (
    <Container
      label="Infrastructure"
      description="GPU fleet management — images, voices, and video instances"
      icon={HiOutlineServerStack}
      right={
        <ButtonRefresh
          onClick={handleRefreshAll}
          isRefreshing={isRefreshingInstances}
        />
      }
    >
      <FleetServicesSection
        isLoadingFleet={isLoadingFleet}
        isRefreshingFleet={isRefreshingFleet}
        error={fleetError}
        fleetInstances={fleetInstances}
        onRefresh={() => void refreshFleet()}
      />

      <EC2InstancesSection
        isLoadingInstances={isLoadingInstances}
        error={instancesError}
        instances={instances}
        isActioningAll={isActioningAll}
        ec2Columns={ec2Columns}
        onEC2ActionAll={handleEC2ActionAll}
        onRefresh={() => void refreshInstances()}
      />

      <CloudFrontSection
        isInvalidating={isInvalidating}
        onInvalidateCloudFront={handleInvalidateCloudFront}
      />
    </Container>
  );
}
