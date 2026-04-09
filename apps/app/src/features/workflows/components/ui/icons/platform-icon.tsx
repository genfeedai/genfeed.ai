import { Monitor, Smartphone, Square } from 'lucide-react';

export function PlatformIcon({
  type,
}: {
  type: 'phone' | 'monitor' | 'square';
}): React.JSX.Element {
  switch (type) {
    case 'phone':
      return <Smartphone className="h-4 w-4" />;
    case 'monitor':
      return <Monitor className="h-4 w-4" />;
    case 'square':
      return <Square className="h-4 w-4" />;
  }
}
