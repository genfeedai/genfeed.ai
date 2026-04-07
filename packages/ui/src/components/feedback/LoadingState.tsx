import Loading from '@ui/loading/default/Loading';

export interface LoadingStateProps {
  isFullSize?: boolean;
}

export default function LoadingState({
  isFullSize = false,
}: LoadingStateProps) {
  return <Loading isFullSize={isFullSize} />;
}
