import { ButtonVariant } from '@genfeedai/enums';
import { Button } from '@ui/primitives/button';

type Props = {
  onBack: () => void;
};

export default function EditorNotFound({ onBack }: Props) {
  return (
    <div className="flex h-screen flex-col items-center justify-center gap-4">
      <h1 className="text-xl font-semibold">Project not found</h1>
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
