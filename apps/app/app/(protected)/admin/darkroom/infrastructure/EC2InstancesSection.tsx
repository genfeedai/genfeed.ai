'use client';

import { ButtonVariant } from '@genfeedai/enums';
import type { IEC2Instance } from '@genfeedai/interfaces';
import type { TableColumn } from '@props/ui/display/table.props';
import CardEmpty from '@ui/card/empty/CardEmpty';
import { SkeletonCard } from '@ui/display/skeleton/skeleton';
import AppTable from '@ui/display/table/Table';
import { WorkspaceSurface } from '@ui/overview/WorkspaceSurface';
import { Button } from '@ui/primitives/button';
import { HiPlay, HiStop } from 'react-icons/hi2';

const EC2_SKELETON_KEYS = [
  'ec2-skeleton-1',
  'ec2-skeleton-2',
  'ec2-skeleton-3',
] as const;

type Props = {
  isLoadingInstances: boolean;
  instances: IEC2Instance[] | undefined;
  isActioningAll: boolean;
  ec2Columns: TableColumn<IEC2Instance>[];
  onEC2ActionAll: (action: 'start' | 'stop') => void;
};

export default function EC2InstancesSection({
  isLoadingInstances,
  instances,
  isActioningAll,
  ec2Columns,
  onEC2ActionAll,
}: Props) {
  return (
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
            onClick={() => onEC2ActionAll('start')}
          >
            <HiPlay className="size-4" />
            Start All
          </Button>

          <Button
            variant={ButtonVariant.UNSTYLED}
            withWrapper={false}
            className="flex items-center gap-1 px-3 py-2 text-sm font-medium rounded bg-error/10 text-error hover:bg-error/20 disabled:opacity-40"
            isDisabled={isActioningAll}
            onClick={() => onEC2ActionAll('stop')}
          >
            <HiStop className="size-4" />
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
  );
}
