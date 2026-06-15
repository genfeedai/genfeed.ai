'use client';

interface ProcessingMessageProps {
  message: string;
}

/**
 * Processing state message with animation
 */
export function ProcessingMessage({
  message,
}: ProcessingMessageProps): React.JSX.Element {
  return (
    <div className="text-center py-2 text-sm text-muted-foreground animate-pulse">
      {message}
    </div>
  );
}
