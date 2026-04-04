import { LuCheck } from 'react-icons/lu';

export interface FeatureListProps {
  features: string[];
  /** Number of columns (1 or 2) */
  columns?: 1 | 2;
  className?: string;
}

/** Checklist of features with Neural Noir styling */
export default function FeatureList({
  className,
  columns = 1,
  features,
}: FeatureListProps) {
  if (columns === 2) {
    const mid = Math.ceil(features.length / 2);
    return (
      <div
        className={`grid grid-cols-1 md:grid-cols-2 gap-8 ${className ?? ''}`}
      >
        <div className="space-y-4">
          {features.slice(0, mid).map((feature) => (
            <FeatureItem key={feature} feature={feature} />
          ))}
        </div>
        <div className="space-y-4">
          {features.slice(mid).map((feature) => (
            <FeatureItem key={feature} feature={feature} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <ul className={`space-y-4 ${className ?? ''}`}>
      {features.map((feature) => (
        <FeatureItem key={feature} feature={feature} />
      ))}
    </ul>
  );
}

function FeatureItem({ feature }: { feature: string }) {
  return (
    <div className="flex items-start gap-3">
      <LuCheck className="h-4 w-4 text-surface/40 mt-0.5 shrink-0" />
      <span className="text-surface/60 text-sm">{feature}</span>
    </div>
  );
}
