'use client';

import type { IFleetInstance } from '@genfeedai/interfaces';
import Card from '@ui/card/Card';
import CardEmpty from '@ui/card/empty/CardEmpty';
import Badge from '@ui/display/badge/Badge';
import { SkeletonCard } from '@ui/display/skeleton/skeleton';
import { WorkspaceSurface } from '@ui/overview/WorkspaceSurface';

const FLEET_SKELETON_KEYS = [
  'fleet-skeleton-1',
  'fleet-skeleton-2',
  'fleet-skeleton-3',
] as const;

const SERVICE_STATUS_COLORS = {
  offline: 'bg-error/10 text-error',
  online: 'bg-success/10 text-success',
  unconfigured: 'bg-foreground/5 text-foreground/60',
} as const;

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

type Props = {
  isLoadingFleet: boolean;
  fleetInstances: IFleetInstance[];
};

export default function FleetServicesSection({
  isLoadingFleet,
  fleetInstances,
}: Props) {
  return (
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
                              <span className="text-foreground/60">Queued</span>
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
  );
}
