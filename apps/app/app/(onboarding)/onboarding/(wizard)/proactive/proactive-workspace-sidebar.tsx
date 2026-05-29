'use client';

import type { ProactiveWorkspaceResponse } from '@services/onboarding/onboarding.service';
import Card from '@ui/card/Card';
import InsetSurface from '@ui/display/inset-surface/InsetSurface';
import { HiBriefcase, HiCheckCircle } from 'react-icons/hi2';

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
      <Card
        bodyClassName="gap-0 p-6"
        className="rounded-3xl border-white/10 bg-white/[0.03]"
      >
        <p className="text-sm uppercase tracking-[0.24em] text-white/30">
          Workspace Context
        </p>
        <div className="mt-4 space-y-4">
          <div>
            <p className="text-xs text-white/35">Organization</p>
            <p className="mt-1 text-lg text-white">
              {workspace.organization?.label || 'Prepared org'}
            </p>
          </div>
          <div>
            <p className="text-xs text-white/35">Brand</p>
            <p className="mt-1 text-lg text-white">
              {workspace.brand?.name || 'Prepared brand'}
            </p>
          </div>
          {workspace.brand?.voiceTone && (
            <div>
              <p className="text-xs text-white/35">Voice snapshot</p>
              <p className="mt-1 text-sm text-white/55">
                {workspace.brand.voiceTone}
              </p>
            </div>
          )}
          {workspace.brand?.colors && workspace.brand.colors.length > 0 && (
            <div>
              <p className="text-xs text-white/35">Brand colors</p>
              <div className="mt-2 flex gap-2">
                {workspace.brand.colors.map((color) => (
                  <div
                    key={color}
                    className="size-6 rounded-full border border-white/10"
                    style={{ backgroundColor: color }}
                    title={color}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </Card>

      <Card
        bodyClassName="gap-0 p-6"
        className="rounded-3xl border-white/10 bg-white/[0.03]"
      >
        <div className="flex items-center gap-2 text-white">
          <HiBriefcase className="size-4 text-white/45" />
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
                    <HiCheckCircle className="size-5 text-emerald-300" />
                  ) : (
                    <div
                      className={`size-3 rounded-full ${
                        isActive ? 'animate-pulse bg-white' : 'bg-white/20'
                      }`}
                    />
                  )}
                </div>
                <p className="text-sm text-white/60">{item.label}</p>
              </InsetSurface>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
