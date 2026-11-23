import NotFoundState from '@ui/feedback/NotFoundState';
import type { EditorNotFoundProps } from '@/features/studio/props/editor-not-found.props';

export default function EditorNotFound({ onBack }: EditorNotFoundProps) {
  return (
    <NotFoundState
      backLinkLabel="Go Back"
      className="h-screen flex-none"
      onBack={onBack}
      title="Project not found"
    />
  );
}
