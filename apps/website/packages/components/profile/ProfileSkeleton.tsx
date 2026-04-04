import { Skeleton } from '@ui/display/skeleton/skeleton';

export default function ProfileSkeleton(): React.ReactElement {
  return (
    <div className="max-w-md mx-auto w-full space-y-6">
      {/* Banner Skeleton */}
      <div className="relative">
        <Skeleton variant="rectangular" className="h-32 w-full" />
        {/* Profile Picture Skeleton */}
        <Skeleton
          variant="circular"
          width={96}
          height={96}
          className="absolute left-1/2 -translate-x-1/2 -bottom-12 ring-4 ring-inv/50"
        />
      </div>

      {/* Profile Info Skeleton */}
      <div className="flex flex-col items-center pt-14 space-y-3">
        <Skeleton variant="text" height={24} className="w-32" />
        <Skeleton variant="text" className="w-48" />
      </div>

      {/* Link Skeletons */}
      <div className="space-y-4">
        <Skeleton
          variant="rounded"
          height={56}
          className="w-full rounded-full"
        />
        <Skeleton
          variant="rounded"
          height={56}
          className="w-full rounded-full"
        />
        <Skeleton
          variant="rounded"
          height={56}
          className="w-full rounded-full"
        />
      </div>

      {/* Social Icons Skeleton */}
      <div className="flex justify-center gap-4 pt-8">
        <Skeleton variant="circular" width={24} height={24} />
        <Skeleton variant="circular" width={24} height={24} />
        <Skeleton variant="circular" width={24} height={24} />
        <Skeleton variant="circular" width={24} height={24} />
      </div>
    </div>
  );
}
