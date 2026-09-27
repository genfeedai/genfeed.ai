import { formatCompactNumber } from '@helpers/formatting/format/format.helper';
import type { Props } from '@props/analytics/hook-analysis-section.props';
import Card from '@ui/card/Card';
import Badge from '@ui/display/badge/Badge';

const REACH_LIMIT = 5;

export default function HookAnalysisSection({ analysisData }: Props) {
  const hooksByReach = [...analysisData.hookEffectiveness]
    .sort((left, right) => right.avgViews - left.avgViews)
    .slice(0, REACH_LIMIT);

  return (
    <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <Card>
        <div className="p-6 space-y-4">
          <h3 className="text-sm font-semibold">
            Top Performing Hook Patterns
          </h3>
          <div className="space-y-3">
            {analysisData.topHooks.length > 0 ? (
              analysisData.topHooks.map((hook, idx) => (
                <div
                  key={hook.hook}
                  className="flex items-start gap-3 bg-tertiary p-3"
                >
                  <Badge className="bg-primary text-primary-foreground text-xs mt-1">
                    #{idx + 1}
                  </Badge>
                  <div className="space-y-1">
                    <p className="text-sm">{hook.hook}</p>
                    <p className="text-xs text-foreground/60">
                      {formatCompactNumber(hook.avgEngagement)} avg engagement •{' '}
                      {hook.postCount} posts
                    </p>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-sm text-foreground/60">
                No top hook patterns detected yet.
              </p>
            )}
          </div>
        </div>
      </Card>

      <Card>
        <div className="p-6 space-y-4">
          <h3 className="text-sm font-semibold">Hooks by Reach</h3>
          <div className="space-y-3">
            {hooksByReach.length > 0 ? (
              hooksByReach.map((hook) => (
                <div
                  key={hook.hook}
                  className="flex items-center justify-between gap-4 bg-tertiary p-3"
                >
                  <div className="min-w-0">
                    <p className="line-clamp-1 font-medium">{hook.hook}</p>
                    <p className="text-xs text-foreground/60">
                      {hook.postCount} posts
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold">
                      {formatCompactNumber(hook.avgViews)}
                    </p>
                    <p className="text-xs text-foreground/60">avg views</p>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-sm text-foreground/60">
                No hook reach data yet.
              </p>
            )}
          </div>
        </div>
      </Card>
    </section>
  );
}
