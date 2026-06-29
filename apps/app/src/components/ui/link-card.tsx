import { cn } from '@/lib/utils';

export interface LinkCardProps {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  /** Large icon style (for prominent cards) */
  prominent?: boolean;
}

/** Clickable external link card */
export function LinkCard({
  href,
  icon: Icon,
  title,
  description,
  prominent,
}: LinkCardProps) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        'flex items-center gap-3 rounded-card border border-border transition hover:border-primary/50 hover:bg-secondary/30',
        prominent ? 'p-4' : 'p-3',
      )}
    >
      {prominent ? (
        <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary/10">
          <Icon className="size-5 text-primary" />
        </div>
      ) : (
        <Icon className="size-5 text-muted-foreground" />
      )}
      <div>
        <div className="font-medium text-foreground">{title}</div>
        <p
          className={cn(
            prominent ? 'text-sm' : 'text-xs',
            'text-muted-foreground',
          )}
        >
          {description}
        </p>
      </div>
    </a>
  );
}

export default LinkCard;
