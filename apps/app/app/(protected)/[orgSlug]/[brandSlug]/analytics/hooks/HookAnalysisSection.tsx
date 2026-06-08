'use client';

import type { IViralHookAnalysis } from '@genfeedai/interfaces/analytics/viral-hooks.interface';
import Card from '@ui/card/Card';
import Badge from '@ui/display/badge/Badge';

type Props = {
  analysisData: IViralHookAnalysis;
};

export default function HookAnalysisSection({ analysisData }: Props) {
  return (
    <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <Card className="border border-white/[0.08] bg-card/80">
        <div className="p-6 space-y-4">
          <h3 className="text-lg font-semibold">Hook Type Effectiveness</h3>
          <div className="space-y-3">
            {analysisData.hookEffectiveness.length > 0 ? (
              analysisData.hookEffectiveness.map((hook) => (
                <div
                  key={hook.type}
                  className="flex items-center justify-between border border-white/[0.08] p-3"
                >
                  <div>
                    <p className="font-medium capitalize">{hook.type} Hooks</p>
                    <p className="text-xs text-foreground/60">
                      {hook.count} instances found
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold">
                      {hook.avgEffectiveness}%
                    </p>
                    <p className="text-xs text-foreground/60">
                      avg effectiveness
                    </p>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-sm text-foreground/60">
                No hook effectiveness data yet.
              </p>
            )}
          </div>
        </div>
      </Card>

      <Card className="border border-white/[0.08] bg-card/80">
        <div className="p-6 space-y-4">
          <h3 className="text-lg font-semibold">
            Top Performing Hook Patterns
          </h3>
          <div className="space-y-3">
            {analysisData.topHooks.length > 0 ? (
              analysisData.topHooks.map((hook, idx) => (
                <div
                  key={hook}
                  className="flex items-start gap-3 border border-white/[0.08] p-3"
                >
                  <Badge className="bg-primary text-primary-foreground text-xs mt-1">
                    #{idx + 1}
                  </Badge>
                  <p className="text-sm">{hook}</p>
                </div>
              ))
            ) : (
              <p className="text-sm text-foreground/60">
                No top hook patterns detected yet.
              </p>
            )}
          </div>
          <div className="mt-4 bg-background/40 p-3">
            <p className="text-xs text-foreground/60">
              <strong>Pro tip</strong> Videos with pattern interrupts in the
              first 3 seconds show 45% higher completion rates across all
              platforms.
            </p>
          </div>
        </div>
      </Card>
    </section>
  );
}
