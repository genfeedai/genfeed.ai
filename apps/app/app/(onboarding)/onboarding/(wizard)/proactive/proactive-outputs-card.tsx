'use client';

import type { IPost } from '@genfeedai/interfaces';
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
    <Card
      bodyClassName="gap-0 p-6"
      className="rounded-3xl border-white/10 bg-white/[0.03]"
    >
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm uppercase tracking-[0.24em] text-white/30">
            Starter Outputs
          </p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white">
            Drafts ready on first login
          </h2>
        </div>
        <div className="text-sm text-white/45">{outputs.length} prepared</div>
      </div>

      <div className="mt-6 grid gap-4">
        {outputs.length > 0 ? (
          outputs.map((post) => (
            <InsetSurface key={post.id} tone="contrast">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-base font-medium text-white">
                  {getOutputTitle(post)}
                </h3>
                <Badge
                  className="px-2 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-white/40"
                  variant="outline"
                >
                  {post.platform}
                </Badge>
              </div>
              {post.description && (
                <p className="mt-3 line-clamp-3 text-sm text-white/55">
                  {post.description}
                </p>
              )}
            </InsetSurface>
          ))
        ) : (
          <InsetSurface
            className="border-dashed p-6 text-sm text-white/45"
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
