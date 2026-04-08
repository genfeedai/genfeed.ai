'use client';

import ButtonRefresh from '@components/buttons/refresh/button-refresh/ButtonRefresh';
import { ButtonVariant } from '@genfeedai/enums';
import type {
  IEC2Instance,
  IFleetHealthResponse,
  IFleetInstance,
} from '@genfeedai/interfaces';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useResource } from '@hooks/data/resource/use-resource/use-resource';
import type { TableColumn } from '@props/ui/display/table.props';
import { useConfirmModal } from '@providers/global-modals/global-modals.provider';
import { AdminDarkroomService } from '@services/admin/darkroom.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import Card from '@ui/card/Card';
import CardEmpty from '@ui/card/empty/CardEmpty';
import Badge from '@ui/display/badge/Badge';
import { SkeletonCard } from '@ui/display/skeleton/skeleton';
import AppTable from '@ui/display/table/Table';
import Container from '@ui/layout/container/Container';
import { WorkspaceSurface } from '@ui/overview/WorkspaceSurface';
import { Button } from '@ui/primitives/button';
import { useCallback, useEffect, useRef, useState } from 'react';
import { HiOutlineServerStack, HiPlay, HiStop } from 'react-icons/hi2';

const FLEET_SKELETON_KEYS = [
  'fleet-skeleton-1',
  'fleet-skeleton-2',
  'fleet-skeleton-3',
] as const;

const EC2_SKELETON_KEYS = [
  'ec2-skeleton-1',
  'ec2-skeleton-2',
  'ec2-skeleton-3',
] as const;

const STATE_BADGE_COLORS = {
  pending: 'bg-warning/10 text-warning',
  running: 'bg-success/10 text-success',
  stopped: 'bg-error/10 text-error',
  stopping: 'bg-warning/10 text-warning',
  terminated: 'bg-foreground/5 text-foreground/40',
} as const;

const SERVICE_STATUS_COLORS = {
  offline: 'bg-error/10 text-error',
  online: 'bg-success/10 text-success',
  unconfigured: 'bg-foreground/5 text-foreground/60',
} as const;

const ROLE_BADGE_COLORS = {
  images: 'bg-violet-500/10 text-violet-500',
  training: 'bg-amber-500/10 text-amber-500',
  videos: 'bg-blue-500/10 text-blue-500',
  voices: 'bg-emerald-500/10 text-emerald-500',
} as const;

const POLL_INTERVAL_MS = 30_000;

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (days > 0) {
    return `${days}d ${hours}h`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

function formatRelativeTime(isoString: string): string {
  const diffMs = Date.now() - new Date(isoString).getTime();
  const seconds = Math.floor(diffMs / 1000);

  if (seconds < 60) {
    return `${seconds}s ago`;
  }
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes}m ago`;
  }
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

function getResponseTimeColor(ms: number): string {
  if (ms < 200) {
    return 'text-success';
  }
  if (ms < 1000) {
    return 'text-warning';
  }
  return 'text-error';
}

export default function InfrastructurePage() {
  const notificationsService = NotificationsService.getInstance();
  const { openConfirm } = useConfirmModal();

  const getDarkroomService = useAuthedService((token: string) =>
    AdminDarkroomService.getInstance(token),
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
    isRefreshing: isRefreshingInstances,
    refresh: refreshInstances,
  } = useResource<IEC2Instance[]>(
    async () => {
      const service = await getDarkroomService();
      return service.getEC2Status();
    },
    {
      onError: (error: unknown) => {
        logger.error(
          'GET /admin/darkroom/infrastructure/ec2/status failed',
          error,
        );
      },
    },
  );

  const {
    data: fleetHealth,
    isLoading: isLoadingFleet,
    refresh: refreshFleet,
  } = useResource<IFleetHealthResponse>(
    async () => {
      const service = await getDarkroomService();
      return service.getFleetHealth();
    },
    {
      onError: (error: unknown) => {
        logger.error(
          'GET /admin/darkroom/infrastructure/fleet/health failed',
          error,
        );
      },
    },
  );

  useEffect(() => {
    pollingRef.current = setInterval(() => {
      refreshFleet();
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
        const service = await getDarkroomService();
        await service.ec2Action(instanceId, action);

        notificationsService.success(
          `Instance ${action === 'start' ? 'starting' : 'stopping'}...`,
        );

        setTimeout(() => refreshInstances(), 2000);
      } catch (error) {
        logger.error(
          `POST /admin/darkroom/infrastructure/ec2/action failed`,
          error,
        );
        notificationsService.error(`Failed to ${action} instance`);
      } finally {
        setActioningInstance(null);
      }
    },
    [getDarkroomService, notificationsService, refreshInstances],
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
          const service = await getDarkroomService();
          await service.invalidateCloudFront(undefined, ['/*']);

          notificationsService.success('CloudFront cache invalidation started');
        } catch (error) {
          logger.error(
            'POST /admin/darkroom/infrastructure/cloudfront/invalidate failed',
            error,
          );
          notificationsService.error('Failed to invalidate CloudFront cache');
        } finally {
          setIsInvalidating(false);
        }
      },
    });
  }, [getDarkroomService, notificationsService, openConfirm]);

  const handleEC2ActionAll = useCallback(
    async (action: 'start' | 'stop') => {
      setIsActioningAll(true);

      try {
        const service = await getDarkroomService();
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
          'POST /admin/darkroom/infrastructure/ec2/action-all failed',
          error,
        );
        notificationsService.error(`Failed to ${action} fleet`);
      } finally {
        setIsActioningAll(false);
      }
    },
    [getDarkroomService, notificationsService, refreshInstances],
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
              <HiPlay className="w-3.5 h-3.5" />
              Start
            </Button>

            <Button
              variant={ButtonVariant.UNSTYLED}
              withWrapper={false}
              className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded bg-error/10 text-error hover:bg-error/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              isDisabled={!canStop || isActioning}
              onClick={() => handleEC2Action(instance.instanceId, 'stop')}
            >
              <HiStop className="w-3.5 h-3.5" />
              Stop
            </Button>
          </div>
        );
      },
    },
  ];

  const handleRefreshAll = useCallback(() => {
    refreshInstances();
    refreshFleet();
  }, [refreshInstances, refreshFleet]);

  const fleetInstances = fleetHealth?.instances ?? [];

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
      {/* Fleet Services Section */}
      <WorkspaceSurface
        className="mb-8"
        title="Fleet Services"
        eyebrow="Darkroom Ops"
        tone="muted"
        data-testid="darkroom-fleet-services-surface"
      >
        {isLoadingFleet ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {FLEET_SKELETON_KEYS.map((key) => (
              <SkeletonCard key={key} showImage={false} />
            ))}
          </div>
        ) : fleetInstances.length === 0 ? (
          <CardEmpty label="No fleet services configured" />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {fleetInstances.map((instance: IFleetInstance) => (
              <Card key={instance.name}>
                <div className="p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">{instance.name}</p>
                      {instance.url && (
                        <p className="text-xs text-foreground/50 truncate max-w-truncate-lg">
                          {instance.url}
                        </p>
                      )}
                    </div>

                    <Badge
                      className={
                        SERVICE_STATUS_COLORS[
                          instance.status as keyof typeof SERVICE_STATUS_COLORS
                        ] ?? 'bg-foreground/5 text-foreground/60'
                      }
                    >
                      {instance.status}
                    </Badge>
                  </div>

                  {instance.status === 'online' && (
                    <div className="space-y-2 border-t border-foreground/5 pt-3">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-foreground/60">Response</span>
                        {instance.responseTimeMs !== undefined && (
                          <span
                            className={`font-mono font-medium ${getResponseTimeColor(instance.responseTimeMs)}`}
                          >
                            {instance.responseTimeMs}ms
                          </span>
                        )}
                      </div>

                      {instance.health && (
                        <>
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-foreground/60">Uptime</span>
                            <span className="font-mono">
                              {formatUptime(instance.health.uptime)}
                            </span>
                          </div>

                          {instance.health.jobs && (
                            <>
                              <div className="flex items-center justify-between text-sm">
                                <span className="text-foreground/60">
                                  Active Jobs
                                </span>
                                <span className="font-mono">
                                  {instance.health.jobs.active}
                                </span>
                              </div>

                              <div className="flex items-center justify-between text-sm">
                                <span className="text-foreground/60">
                                  Queued
                                </span>
                                <span className="font-mono">
                                  {instance.health.jobs.queued}
                                </span>
                              </div>
                            </>
                          )}
                        </>
                      )}
                    </div>
                  )}

                  {instance.lastChecked && (
                    <p className="text-xs text-foreground/40 pt-1">
                      Last checked: {formatRelativeTime(instance.lastChecked)}
                    </p>
                  )}
                </div>
              </Card>
            ))}
          </div>
        )}
      </WorkspaceSurface>

      {/* EC2 Instances Section */}
      <WorkspaceSurface
        className="mb-8"
        title="GPU Fleet Instances"
        tone="muted"
        data-testid="darkroom-ec2-surface"
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant={ButtonVariant.UNSTYLED}
              withWrapper={false}
              className="flex items-center gap-1 px-3 py-2 text-sm font-medium rounded bg-success/10 text-success hover:bg-success/20 disabled:opacity-40"
              isDisabled={isActioningAll}
              onClick={() => handleEC2ActionAll('start')}
            >
              <HiPlay className="w-4 h-4" />
              Start All
            </Button>

            <Button
              variant={ButtonVariant.UNSTYLED}
              withWrapper={false}
              className="flex items-center gap-1 px-3 py-2 text-sm font-medium rounded bg-error/10 text-error hover:bg-error/20 disabled:opacity-40"
              isDisabled={isActioningAll}
              onClick={() => handleEC2ActionAll('stop')}
            >
              <HiStop className="w-4 h-4" />
              Stop All
            </Button>
          </div>
        }
      >
        {isLoadingInstances ? (
          <div className="grid grid-cols-1 gap-4">
            {EC2_SKELETON_KEYS.map((key) => (
              <SkeletonCard key={key} showImage={false} />
            ))}
          </div>
        ) : !instances || instances.length === 0 ? (
          <CardEmpty label="No EC2 instances found" />
        ) : (
          <AppTable<IEC2Instance>
            columns={ec2Columns}
            emptyLabel="No EC2 instances found"
            getRowKey={(i) => i.instanceId}
            isLoading={false}
            items={instances}
          />
        )}
      </WorkspaceSurface>

      {/* CloudFront Section */}
      <WorkspaceSurface
        title="CloudFront"
        tone="muted"
        data-testid="darkroom-cloudfront-surface"
      >
        <Card className="border-0 bg-transparent shadow-none">
          <div className="p-6 flex items-center justify-between">
            <div>
              <p className="font-medium">Cache Invalidation</p>
              <p className="text-sm text-foreground/60">
                Invalidate CloudFront distribution cache for all paths
              </p>
            </div>

            <Button
              variant={ButtonVariant.DEFAULT}
              isDisabled={isInvalidating}
              isLoading={isInvalidating}
              onClick={handleInvalidateCloudFront}
              label={isInvalidating ? 'Invalidating...' : 'Invalidate Cache'}
            />
          </div>
        </Card>
      </WorkspaceSurface>
    </Container>
  );
}
