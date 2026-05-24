import type { SkeletonLoadingProps } from '@genfeedai/props/ui/feedback/skeleton-loading.props';
import {
  SkeletonAnalyticsDashboard,
  SkeletonBrandsList,
  SkeletonMasonryGrid,
  SkeletonTable,
  SkeletonVideoGrid,
} from '@ui/display/skeleton/skeleton';

export function SkeletonLoadingFallback({
  type = 'masonry',
  count = 12,
  rows = 8,
  columns = 5,
}: SkeletonLoadingProps) {
  let skeletonContent: React.ReactNode;
  switch (type) {
    case 'masonry':
      skeletonContent = <SkeletonMasonryGrid count={count} />;
      break;
    case 'videoGrid':
      skeletonContent = <SkeletonVideoGrid count={count} />;
      break;
    case 'brands':
      skeletonContent = <SkeletonBrandsList count={count} />;
      break;
    case 'table':
      skeletonContent = <SkeletonTable rows={rows} columns={columns} />;
      break;
    case 'analytics':
      skeletonContent = <SkeletonAnalyticsDashboard />;
      break;
    case 'gallery':
      skeletonContent = (
        <div className="space-y-6">
          <div className="flex flex-wrap gap-4 mb-6">
            <div className="h-10 bg-background w-32 animate-pulse"></div>
            <div className="h-10 bg-background w-24 animate-pulse"></div>
            <div className="h-10 bg-background w-28 animate-pulse"></div>
          </div>

          <SkeletonMasonryGrid count={count} />

          <div className="flex justify-center mt-8">
            <div className="flex space-x-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <div
                  key={i}
                  className="size-10 bg-background animate-pulse"
                ></div>
              ))}
            </div>
          </div>
        </div>
      );
      break;
    case 'settings':
      skeletonContent = (
        <div className="space-y-6">
          <div className="h-8 bg-background w-1/4 animate-pulse mb-8"></div>
          {Array.from({ length: count }).map((_, sectionIndex) => (
            <div
              key={sectionIndex}
              className=" border border-white/[0.08] bg-card shadow-xl"
            >
              <div className="p-4">
                <div className="h-6 bg-background w-1/3 animate-pulse mb-4"></div>
                <div className="space-y-4">
                  {Array.from({ length: 4 }).map((_, fieldIndex) => (
                    <div key={fieldIndex} className="space-y-2">
                      <div className="h-4 bg-background w-1/4 animate-pulse"></div>
                      <div className="h-10 bg-card w-full animate-pulse"></div>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2 mt-6">
                  <div className="h-10 bg-background w-24 animate-pulse"></div>
                  <div className="h-10 bg-background w-20 animate-pulse"></div>
                </div>
              </div>
            </div>
          ))}
        </div>
      );
      break;
    default:
      skeletonContent = <SkeletonMasonryGrid count={count} />;
  }

  return (
    <div className="container min-h-[calc(100vh-334px)] h-auto p-4">
      {skeletonContent}
    </div>
  );
}
