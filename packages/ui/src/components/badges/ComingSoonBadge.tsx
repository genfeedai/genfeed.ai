'use client';

import { Badge } from '@ui/primitives/badge';

interface ComingSoonBadgeProps {
  className?: string;
}

export default function ComingSoonBadge({ className }: ComingSoonBadgeProps) {
  return <Badge className={className}>Soon</Badge>;
}
