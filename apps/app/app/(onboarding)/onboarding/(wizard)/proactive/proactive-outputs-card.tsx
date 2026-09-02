'use client';

import type { IPost } from '@genfeedai/contracts/interfaces';
import Card from '@ui/card/Card';
import Badge from '@ui/display/badge/Badge';
import InsetSurface from '@ui/display/inset-surface/InsetSurface';

function getOutputTitle(post: IPost): string {
  return (
    post.label?.trim() || post.description?.trim() || `${post.platform} draft`
  );
}

type Props = {
  outputs: IPost[];
};

export default function ProactiveOutputsCard({ outputs }: Props) {
  return (
    <Card bodyClassName="gap-0 p-6" className="border-border bg-card">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm uppercase tracking-[0.24em] text-gray-800">
            Starter Outputs
          </p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
            Drafts ready on first login
          </h2>
        </div>
        <div className="text-sm text-muted-foreground">
          {outputs.length} prepared
        </div>
      </div>

      <div className="mt-6 grid gap-4">
        {outputs.length > 0 ? (
          outputs.map((post) => (
            <InsetSurface key={post.id} tone="contrast">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-base font-medium text-foreground">
                  {getOutputTitle(post)}
                </h3>
                <Badge
                  className="px-2 py-1 text-2xs font-black uppercase tracking-[0.18em] text-gray-800"
                  variant="outline"
                >
                  {post.platform}
                </Badge>
              </div>
              {post.description && (
                <p className="mt-3 line-clamp-3 text-sm text-muted-foreground">
                  {post.description}
                </p>
              )}
            </InsetSurface>
          ))
        ) : (
          <InsetSurface
            className="border-dashed p-6 text-sm text-muted-foreground"
            tone="contrast"
          >
            Draft outputs are still finalizing. You can continue straight to
            your prepared workspace and they will keep hydrating.
          </InsetSurface>
        )}
      </div>
    </Card>
  );
}
