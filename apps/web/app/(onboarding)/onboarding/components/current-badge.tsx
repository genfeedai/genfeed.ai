import { Badge } from '@ui/primitives/badge';

export const CURRENT_RING = 'ring-1 ring-border-strong';

export default function CurrentBadge() {
  return (
    <Badge className="absolute -top-2 right-3 z-10" variant="secondary">
      Current
    </Badge>
  );
}
