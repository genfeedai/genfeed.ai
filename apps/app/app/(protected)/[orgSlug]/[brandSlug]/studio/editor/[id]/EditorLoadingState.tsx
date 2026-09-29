import Spinner from '@ui/primitives/spinner';
export default function EditorLoadingState() {
  return (
    <div className="flex h-screen items-center justify-center">
      <Spinner className="size-12 text-primary" />
    </div>
  );
}
