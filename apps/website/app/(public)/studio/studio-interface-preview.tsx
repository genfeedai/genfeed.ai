'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import type { PublicModelCatalogItem } from '@public/models/models-loader';
import { Button } from '@ui/primitives/button';
import PromptBarComposer from '@ui/prompt-bars/components/shell/PromptBarComposer';
import MediaCanvasShell from '@ui/shell/media-canvas/MediaCanvasShell';
import { HOME_OUTPUT_CAROUSEL_ASSETS } from '@web-components/home/_assets';
import {
  ArrowUp,
  Clapperboard,
  ImageIcon,
  LayoutGrid,
  Mic2,
  Paperclip,
  SlidersHorizontal,
  Sparkles,
} from 'lucide-react';
import Image from 'next/image';

interface StudioInterfacePreviewProps {
  models: PublicModelCatalogItem[] | null;
}

const STUDIO_NAV = [
  { icon: Sparkles, label: 'Generate' },
  { icon: Clapperboard, label: 'Storyboard' },
  { icon: LayoutGrid, label: 'Clips' },
];

const OUTPUTS = HOME_OUTPUT_CAROUSEL_ASSETS.slice(0, 3);

export default function StudioInterfacePreview({
  models,
}: StudioInterfacePreviewProps) {
  const catalogLabel = models
    ? `${models.length} models available`
    : 'Connecting to catalog';

  return (
    <div className="w-full max-w-[760px] overflow-hidden rounded-2xl border border-edge/15 bg-background shadow-[0_32px_100px_rgba(0,0,0,0.35)]">
      <div className="flex h-11 items-center justify-between border-b border-edge/10 px-4">
        <div className="flex items-center gap-3">
          <div className="flex size-6 items-center justify-center rounded-full bg-surface text-[10px] font-black text-background">
            G
          </div>
          <span className="text-xs font-semibold text-surface">Studio</span>
          <span className="text-xs text-surface/35">/</span>
          <span className="text-xs text-surface/55">Generate</span>
        </div>
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.1em] text-surface/45">
          <span className="size-1.5 rounded-full bg-emerald-400" />
          {catalogLabel}
        </div>
      </div>

      <div className="grid min-h-[430px] grid-cols-[120px_minmax(0,1fr)] sm:min-h-[500px] sm:grid-cols-[150px_minmax(0,1fr)]">
        <aside className="border-r border-edge/10 p-2.5 sm:p-3">
          <p className="px-2 pb-3 pt-2 text-[9px] font-bold uppercase tracking-[0.16em] text-surface/35">
            Create
          </p>
          <div className="space-y-1">
            {STUDIO_NAV.map(({ icon: Icon, label }, index) => (
              <Button
                ariaLabel={label}
                className={`w-full justify-start gap-2 px-2.5 text-[11px] ${
                  index === 0 ? 'bg-surface/8 text-surface' : 'text-surface/45'
                }`}
                key={label}
                size={ButtonSize.SM}
                type="button"
                variant={ButtonVariant.UNSTYLED}
                withWrapper={false}
              >
                <Icon className="size-3.5" />
                <span className="hidden sm:inline">{label}</span>
              </Button>
            ))}
          </div>
          <div className="mt-8 border-t border-edge/10 px-2 pt-4">
            <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-surface/30">
              Workspace
            </p>
            <p className="mt-2 text-[11px] text-surface/60">Northstar launch</p>
          </div>
        </aside>

        <MediaCanvasShell
          ambientColor="#54446e"
          ambientIntensity="default"
          className="min-w-0"
          hasTexture={false}
        >
          <div className="flex h-full flex-col p-3 sm:p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-base font-semibold text-surface sm:text-lg">
                  What are we making?
                </p>
                <p className="mt-1 text-[10px] text-surface/45 sm:text-xs">
                  Generate once, then adapt every output.
                </p>
              </div>
              <Button
                ariaLabel="Generation settings"
                className="size-8 shrink-0 border border-edge/10 text-surface/60"
                size={ButtonSize.ICON}
                type="button"
                variant={ButtonVariant.UNSTYLED}
                withWrapper={false}
              >
                <SlidersHorizontal className="size-3.5" />
              </Button>
            </div>

            <div className="mt-5 grid min-h-0 flex-1 grid-cols-3 gap-2 sm:gap-3">
              {OUTPUTS.map((output, index) => (
                <figure
                  className={`relative overflow-hidden rounded-lg border border-white/10 bg-card ${
                    index === 0 ? 'col-span-2' : 'col-span-1'
                  }`}
                  key={output.alt}
                >
                  <Image
                    alt={output.alt}
                    className="object-cover"
                    fill
                    sizes={index === 0 ? '480px' : '240px'}
                    src={output.src}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-transparent to-transparent" />
                  <figcaption className="absolute inset-x-0 bottom-0 p-2.5 sm:p-3">
                    <p className="text-[8px] font-bold uppercase tracking-[0.13em] text-white/55 sm:text-[9px]">
                      {output.format}
                    </p>
                    <p className="mt-1 text-[10px] font-semibold text-white sm:text-xs">
                      {output.title}
                    </p>
                  </figcaption>
                </figure>
              ))}
            </div>

            <PromptBarComposer className="mt-3 border border-white/10 bg-black/60 shadow-xl">
              <div className="min-h-11 px-2 py-1.5 text-xs leading-5 text-surface/75 sm:px-3 sm:text-sm">
                Build a complete launch campaign from this product reference
              </div>
              <div className="flex items-center justify-between gap-2 border-t border-white/[0.06] px-2 py-2">
                <div className="flex min-w-0 items-center gap-1">
                  <Button
                    ariaLabel="Attach reference"
                    className="size-7 text-surface/50"
                    size={ButtonSize.ICON}
                    type="button"
                    variant={ButtonVariant.UNSTYLED}
                    withWrapper={false}
                  >
                    <Paperclip className="size-3.5" />
                  </Button>
                  <span className="hidden items-center gap-1.5 rounded-full border border-edge/10 px-2 py-1 text-[10px] text-surface/55 sm:inline-flex">
                    <ImageIcon className="size-3" /> Image
                  </span>
                  <span className="hidden items-center gap-1.5 rounded-full border border-edge/10 px-2 py-1 text-[10px] text-surface/55 md:inline-flex">
                    <Mic2 className="size-3" /> Voice
                  </span>
                </div>
                <Button
                  ariaLabel="Generate"
                  className="size-7 rounded-full bg-surface text-background"
                  size={ButtonSize.ICON}
                  type="button"
                  withWrapper={false}
                >
                  <ArrowUp className="size-3.5" />
                </Button>
              </div>
            </PromptBarComposer>
          </div>
        </MediaCanvasShell>
      </div>
    </div>
  );
}
