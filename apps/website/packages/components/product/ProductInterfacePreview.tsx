'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { Button } from '@ui/primitives/button';
import PromptBarComposer from '@ui/prompt-bars/components/shell/PromptBarComposer';
import {
  ArrowUp,
  Check,
  CircleDot,
  Command,
  MoreHorizontal,
  Plus,
} from 'lucide-react';

export interface ProductInterfacePreviewProps {
  product: {
    category: string;
    features: Array<{ description: string; title: string }>;
    headline: string;
    name: string;
    useCases: Array<{ description: string; title: string }>;
  };
}

export default function ProductInterfacePreview({
  product,
}: ProductInterfacePreviewProps) {
  const primaryFeatures = product.features.slice(0, 3);
  const recentWork = product.useCases.slice(0, 3);

  return (
    <div className="w-full max-w-[720px] overflow-hidden rounded-2xl border border-edge/15 bg-background shadow-[0_32px_100px_rgba(0,0,0,0.35)]">
      <div className="flex h-11 items-center justify-between border-b border-edge/10 px-4">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-surface text-[10px] font-black text-background">
            G
          </div>
          <span className="truncate text-xs font-semibold text-surface">
            {product.name}
          </span>
          <span className="text-xs text-surface/30">/</span>
          <span className="hidden truncate text-xs text-surface/50 sm:block">
            {product.category}
          </span>
        </div>
        <div className="flex items-center gap-2 text-[9px] font-bold uppercase tracking-[0.12em] text-surface/45">
          <span className="size-1.5 rounded-full bg-emerald-400" />
          Live workspace
        </div>
      </div>

      <div className="grid min-h-[430px] grid-cols-[126px_minmax(0,1fr)] sm:min-h-[480px] sm:grid-cols-[170px_minmax(0,1fr)]">
        <aside className="border-r border-edge/10 p-3">
          <p className="px-2 pb-3 pt-1 text-[9px] font-bold uppercase tracking-[0.16em] text-surface/35">
            Product
          </p>
          <div className="space-y-1">
            {primaryFeatures.map((feature, index) => (
              <Button
                ariaLabel={feature.title}
                className={`h-auto w-full justify-start px-2.5 py-2 text-left text-[10px] leading-4 sm:text-[11px] ${
                  index === 0 ? 'bg-surface/8 text-surface' : 'text-surface/45'
                }`}
                key={feature.title}
                type="button"
                variant={ButtonVariant.UNSTYLED}
                withWrapper={false}
              >
                <CircleDot className="mr-2 size-3 shrink-0" />
                <span className="line-clamp-2">{feature.title}</span>
              </Button>
            ))}
          </div>
          <div className="mt-8 border-t border-edge/10 px-2 pt-4">
            <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-surface/30">
              Workspace
            </p>
            <p className="mt-2 text-[11px] text-surface/60">Campaign HQ</p>
          </div>
        </aside>

        <div className="flex min-w-0 flex-col bg-surface/[0.018] p-3 sm:p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="truncate text-base font-semibold text-surface sm:text-lg">
                {product.name}
              </p>
              <p className="mt-1 line-clamp-2 text-[10px] leading-4 text-surface/45 sm:text-xs">
                {product.headline}
              </p>
            </div>
            <Button
              ariaLabel={`Create in ${product.name}`}
              className="shrink-0 gap-1.5 bg-surface px-2.5 text-[10px] text-background sm:px-3"
              size={ButtonSize.SM}
              type="button"
              withWrapper={false}
            >
              <Plus className="size-3" />
              <span className="hidden sm:inline">New</span>
            </Button>
          </div>

          <div className="mt-5 min-h-0 flex-1 overflow-hidden rounded-xl border border-edge/10 bg-background/55">
            <div className="flex items-center justify-between border-b border-edge/10 px-3 py-2.5">
              <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-surface/45">
                Active work
              </p>
              <MoreHorizontal className="size-4 text-surface/35" />
            </div>
            <div className="divide-y divide-edge/10">
              {recentWork.map((useCase, index) => (
                <div
                  className="grid grid-cols-[1fr_auto] gap-3 px-3 py-3.5 sm:px-4 sm:py-4"
                  key={useCase.title}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="flex size-5 shrink-0 items-center justify-center rounded-md bg-surface/[0.06] text-[9px] font-semibold text-surface/45">
                        {String(index + 1).padStart(2, '0')}
                      </span>
                      <p className="truncate text-xs font-semibold text-surface sm:text-sm">
                        {useCase.title}
                      </p>
                    </div>
                    <p className="mt-2 line-clamp-2 pl-7 text-[10px] leading-4 text-surface/42 sm:text-[11px]">
                      {useCase.description}
                    </p>
                  </div>
                  <div className="flex items-start gap-1.5 pt-0.5 text-[9px] uppercase tracking-[0.1em] text-emerald-400/75">
                    <Check className="size-3" />
                    <span className="hidden sm:inline">Ready</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <PromptBarComposer className="mt-3 border border-white/10 bg-black/55 shadow-xl">
            <div className="flex min-h-12 items-center px-3 text-xs text-surface/55 sm:text-sm">
              Tell Genfeed what to do in {product.name}
            </div>
            <div className="flex items-center justify-between border-t border-white/[0.06] px-2 py-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-edge/10 px-2 py-1 text-[9px] text-surface/45">
                <Command className="size-3" /> Product agent
              </span>
              <Button
                ariaLabel="Run command"
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
      </div>
    </div>
  );
}
