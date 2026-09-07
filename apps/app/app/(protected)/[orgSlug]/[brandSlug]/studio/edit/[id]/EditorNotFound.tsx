import { ButtonVariant } from '@genfeedai/contracts';
import type { EditorNotFoundProps } from '@props/studio/editor-not-found.props';
import { Button } from '@ui/primitives/button';

export default function EditorNotFound({ onBack }: EditorNotFoundProps) {
  return (
    <div className="flex h-screen flex-col items-center justify-center gap-4">
      <h2 className="text-xl font-semibold">Project not found</h2>
      <Button
        withWrapper={false}
        variant={ButtonVariant.DEFAULT}
        onClick={onBack}
      >
        Go Back
      </Button>
    </div>
  );
}
