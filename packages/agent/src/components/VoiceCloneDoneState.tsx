import { Alert } from '@ui/primitives/alert';
import type { ReactElement } from 'react';

export function VoiceCloneDoneState(): ReactElement {
  return (
    <Alert className="my-2" variant="success">
      Voice is ready and set for this brand
    </Alert>
  );
}
