'use client';

import type { ProactiveWorkspaceResponse } from '@services/onboarding/onboarding.service';
import Card from '@ui/card/Card';
import InsetSurface from '@ui/display/inset-surface/InsetSurface';
import { Briefcase, CircleCheck } from 'lucide-react';

const LIVE_UPDATES = [
  {
    key: 'researching_brand',
    label: 'Refining your brand voice',
  },
  {
    key: 'generating_outputs',
    label: 'Generating more ideas',
  },
  {
    key: 'ready',
    label: 'Finding channel context',
  },
];

type Props = {
  workspace: ProactiveWorkspaceResponse;
};

export default function ProactiveWorkspaceSidebar({ workspace }: Props) {
  return (
    <div className="space-y-6">
      <Card bodyClassName="gap-0 p-6" className="border-border bg-card">
        <p className="text-sm uppercase tracking-[0.24em] text-gray-800">
          Workspace Context
        </p>
        <div className="mt-4 space-y-4">
          <div>
            <p className="text-xs text-gray-800">Organization</p>
            <p className="mt-1 text-lg text-foreground">
              {workspace.organization?.label || 'Prepared org'}
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-800">Brand</p>
            <p className="mt-1 text-lg text-foreground">
              {workspace.brand?.name || 'Prepared brand'}
            </p>
          </div>
          {workspace.brand?.voiceTone && (
            <div>
              <p className="text-xs text-gray-800">Voice snapshot</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {workspace.brand.voiceTone}
              </p>
            </div>
          )}
          {workspace.brand?.colors && workspace.brand.colors.length > 0 && (
            <div>
              <p className="text-xs text-gray-800">Brand colors</p>
              <div className="mt-2 flex gap-2">
                {workspace.brand.colors.map((color) => (
                  <div
                    key={color}
                    className="size-6 rounded-full border border-border"
                    style={{ backgroundColor: color }}
                    title={color}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </Card>

      <Card bodyClassName="gap-0 p-6" className="border-border bg-card">
        <div className="flex items-center gap-2 text-foreground">
          <Briefcase className="size-4 text-muted-foreground" />
          <h2 className="text-lg font-medium">Live refinement</h2>
        </div>
        <div className="mt-4 space-y-3">
          {LIVE_UPDATES.map((item) => {
            const isActive = workspace.prepStage === item.key;
            const isComplete =
              workspace.prepStage === 'ready' && item.key !== 'ready';

            return (
              <InsetSurface
                key={item.key}
                className="flex items-center gap-3 px-4 py-3"
                density="compact"
                tone="contrast"
              >
                <div className="flex size-5 items-center justify-center">
                  {isComplete ? (
                    <CircleCheck className="size-5 text-success" />
                  ) : (
                    <div
                      className={`size-3 rounded-full ${
                        isActive ? 'animate-pulse bg-primary' : 'bg-gray-600'
                      }`}
                    />
                  )}
                </div>
                <p className="text-sm text-muted-foreground">{item.label}</p>
              </InsetSurface>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
