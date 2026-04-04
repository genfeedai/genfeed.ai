import { SkeletonLoadingFallback } from '@ui/loading/skeleton/SkeletonFallbacks';

export default function Loading() {
  return <SkeletonLoadingFallback type="table" rows={10} columns={6} />;
}
