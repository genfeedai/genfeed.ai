import type { Newsletter } from '@models/content/newsletter.model';
import Card from '@ui/card/Card';
import Badge from '@ui/display/badge/Badge';
import type { NewsletterContextPreview } from './newsletters-page';

function statusLabel(status: Newsletter['status']): string {
  switch (status) {
    case 'ready_for_review':
      return 'Ready For Review';
    default:
      return status.replace(/_/g, ' ');
  }
}

type Props = {
  contextPreview: NewsletterContextPreview | null;
};

export default function NewsletterContextReview({ contextPreview }: Props) {
  return (
    <Card className="space-y-4 p-5">
      <div>
        <h2 className="text-lg font-semibold">Context review</h2>
        <p className="text-sm text-muted-foreground">
          Inspect the memory stack behind the current draft before approving or
          publishing it.
        </p>
      </div>

      {contextPreview ? (
        <div className="space-y-4">
          <div className="rounded-lg border border-border p-3">
            <div className="text-sm font-medium text-foreground">
              Selected continuity issues
            </div>
            <div className="mt-3 space-y-2">
              {contextPreview.selectedContext.length > 0 ? (
                contextPreview.selectedContext.map((item) => (
                  <div key={item.id} className="rounded bg-muted/30 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm font-medium text-foreground">
                        {item.label}
                      </div>
                      <Badge status={item.status}>
                        {statusLabel(item.status as Newsletter['status'])}
                      </Badge>
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {item.topic}
                    </div>
                    {item.summary ? (
                      <div className="mt-2 text-xs text-muted-foreground">
                        {item.summary}
                      </div>
                    ) : null}
                  </div>
                ))
              ) : (
                <div className="text-sm text-muted-foreground">
                  No prior issues were attached to this draft.
                </div>
              )}
            </div>
          </div>

          <div className="rounded-lg border border-border p-3">
            <div className="text-sm font-medium text-foreground">
              Context sources
            </div>
            <div className="mt-3 space-y-2">
              {contextPreview.contextSources.length > 0 ? (
                contextPreview.contextSources.slice(0, 5).map((source) => (
                  <div
                    key={`${source.label}-${source.url ?? 'internal'}`}
                    className="rounded bg-muted/30 p-3"
                  >
                    <div className="text-sm font-medium text-foreground">
                      {source.label}
                    </div>
                    {source.summary ? (
                      <div className="mt-1 text-xs text-muted-foreground">
                        {source.summary}
                      </div>
                    ) : null}
                  </div>
                ))
              ) : (
                <div className="text-sm text-muted-foreground">
                  No context summaries were attached.
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
          Generate or select a newsletter to inspect the memory context used
          during drafting.
        </div>
      )}
    </Card>
  );
}
