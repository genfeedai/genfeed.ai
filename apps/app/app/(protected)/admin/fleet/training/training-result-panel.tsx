import type { IFleetTraining } from '@genfeedai/interfaces';
import { WorkspaceSurface } from '@ui/overview/WorkspaceSurface';
import Link from 'next/link';

type Props = {
  training: IFleetTraining;
};

export default function TrainingResultPanel({ training }: Props) {
  return (
    <WorkspaceSurface
      title={`Training ${training.status}`}
      tone="muted"
      className="mt-6"
      data-testid="fleet-training-result-surface"
    >
      <div className="flex items-center gap-3">
        <span className="text-2xl">
          {training.status === 'completed' ? '✅' : '❌'}
        </span>

        <div>
          {training.status === 'completed' && (
            <Link
              href={`/admin/fleet/characters/${training.personaSlug}`}
              className="text-sm text-primary hover:underline"
            >
              View character
            </Link>
          )}
        </div>
      </div>
    </WorkspaceSurface>
  );
}
