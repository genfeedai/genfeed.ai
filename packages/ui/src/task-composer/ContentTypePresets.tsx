import { ButtonVariant } from '@genfeedai/enums';
import { Button } from '@ui/primitives/button';
import { cn } from '../lib/utils';

export type ContentType = 'image' | 'video' | 'text';

interface ContentTypePresetsProps {
  selected: ContentType;
  onChange: (type: ContentType) => void;
  types?: ContentType[];
  className?: string;
}

const LABELS: Record<ContentType, string> = {
  image: 'Image',
  text: 'Text',
  video: 'Video',
};

export function ContentTypePresets({
  selected,
  onChange,
  types = ['image', 'video', 'text'],
  className,
}: ContentTypePresetsProps) {
  return (
    <div className={cn('flex gap-1', className)}>
      {types.map((type) => (
        <Button
          key={type}
          variant={
            selected === type ? ButtonVariant.OUTLINE : ButtonVariant.GHOST
          }
          onClick={() => onChange(type)}
          className={cn(
            'px-3 py-1.5 text-xs font-medium capitalize transition-colors',
            selected === type
              ? 'border border-foreground/30 text-foreground'
              : 'border border-border text-muted-foreground hover:text-foreground',
          )}
        >
          {LABELS[type]}
        </Button>
      ))}
    </div>
  );
}
