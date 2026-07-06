'use client';

import Card from '@ui/card/Card';
import { Button } from '@ui/primitives/button';

type Props = {
  error: string;
  onRetry: () => void;
};

export default function TrainingsErrorState({ error, onRetry }: Props) {
  return (
    <div className="container mx-auto flex min-h-56 items-center justify-center px-4 py-8">
      <Card className="p-12 w-full max-w-md text-center">
        <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-destructive/10">
          <span className="text-2xl text-destructive">!</span>
        </div>

        <h3 className="mb-2 text-lg font-semibold text-foreground">
          Failed to load trainings
        </h3>

        <p className="mb-4 text-muted-foreground">{error}</p>

        <div className="flex justify-center">
          <Button label="Try Again" onClick={onRetry} className="mt-4" />
        </div>
      </Card>
    </div>
  );
}
