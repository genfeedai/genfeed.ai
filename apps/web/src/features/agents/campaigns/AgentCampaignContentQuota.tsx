'use client';

type ContentQuota = {
  images?: number;
  posts?: number;
  videos?: number;
};

type Props = {
  contentQuota: ContentQuota;
};

export default function AgentCampaignContentQuota({ contentQuota }: Props) {
  return (
    <div className="bg-card p-4 shadow-border">
      <h3 className="mb-4 text-lg font-semibold">Content Quota</h3>
      <div className="grid grid-cols-3 gap-4">
        {contentQuota.posts !== undefined && (
          <div className="flex flex-col">
            <span className="text-sm text-foreground/50">Posts</span>
            <span className="text-lg font-medium">{contentQuota.posts}</span>
          </div>
        )}
        {contentQuota.images !== undefined && (
          <div className="flex flex-col">
            <span className="text-sm text-foreground/50">Images</span>
            <span className="text-lg font-medium">{contentQuota.images}</span>
          </div>
        )}
        {contentQuota.videos !== undefined && (
          <div className="flex flex-col">
            <span className="text-sm text-foreground/50">Videos</span>
            <span className="text-lg font-medium">{contentQuota.videos}</span>
          </div>
        )}
      </div>
    </div>
  );
}
