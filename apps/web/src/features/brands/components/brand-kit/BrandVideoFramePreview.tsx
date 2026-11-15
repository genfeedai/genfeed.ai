'use client';

import Card from '@ui/card/Card';
import { SegmentedControl } from '@ui/primitives/segmented-control';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import type { BrandVideoFramePreviewProps } from '@/features/brands/props/brand-video-kit.props';

const CORNER_CLASS: Record<string, string> = {
  center: 'left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2',
  'bottom-left': 'bottom-3 left-3',
  'bottom-right': 'bottom-3 right-3',
  'top-left': 'left-3 top-3',
  'top-right': 'right-3 top-3',
};

const CAPTION_CLASS = {
  bottom: 'bottom-14',
  middle: 'top-1/2 -translate-y-1/2',
  top: 'top-12',
} as const;

/** A 9:16 sketch of what the saved video identity and finishing do to a frame. */
export default function BrandVideoFramePreview({
  video,
  finishing,
  brand,
}: BrandVideoFramePreviewProps) {
  const t = useTranslations('pages.brandVideoKit');
  const [scene, setScene] = useState<'scene' | 'end'>('scene');
  const isEndCard = scene === 'end';
  const captions = video?.captions;
  const logo = video?.logoPlacement;
  const logoVisible = logo
    ? isEndCard
      ? logo.appliesTo !== 'intro'
      : logo.appliesTo !== 'outro'
    : false;
  const mark = finishing.watermark.text ?? '';

  return (
    <Card>
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold">{t('preview.title')}</h3>
          <SegmentedControl
            ariaLabel={t('preview.frame')}
            value={scene}
            onValueChange={setScene}
            options={[
              { label: t('preview.scene'), value: 'scene' },
              { label: t('preview.endCard'), value: 'end' },
            ]}
          />
        </div>
        <div className="relative mx-auto aspect-[9/16] w-full max-w-[260px] overflow-hidden rounded-xl border border-border bg-gradient-to-b from-zinc-700 to-zinc-900 text-white">
          {isEndCard ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-zinc-950">
              {finishing.endCard.isEnabled ? (
                <>
                  <span className="text-lg font-semibold">{brand.label}</span>
                  <span className="text-xs text-zinc-400">
                    {t('preview.endCardSeconds', {
                      seconds: finishing.endCard.durationSeconds,
                    })}
                  </span>
                </>
              ) : (
                <span className="px-6 text-center text-xs text-zinc-400">
                  {t('preview.endCardOff')}
                </span>
              )}
            </div>
          ) : (
            <>
              <div className="absolute inset-x-6 top-1/3 h-1/4 rounded-lg bg-white/10" />
              {captions && captions.style !== 'none' ? (
                <div
                  className={`absolute inset-x-4 text-center text-sm font-semibold ${CAPTION_CLASS[captions.position]} ${
                    captions.style === 'boxed'
                      ? 'rounded bg-black/70 px-2 py-1'
                      : ''
                  } ${captions.style === 'bold_word' ? 'uppercase tracking-wide' : ''}`}
                >
                  {t('preview.caption')}
                </div>
              ) : null}
            </>
          )}
          {logo && logoVisible ? (
            <div
              className={`absolute rounded bg-white/90 px-1.5 py-0.5 text-[10px] font-bold text-zinc-900 ${CORNER_CLASS[logo.position]}`}
              style={{
                transform: `scale(${Math.max(0.6, logo.sizeRatio * 8)})`,
              }}
            >
              {brand.label}
            </div>
          ) : null}
          {mark && !isEndCard ? (
            <div
              className={`absolute text-[10px] ${CORNER_CLASS[finishing.watermark.position]}`}
              style={{ opacity: finishing.watermark.opacity }}
            >
              {mark}
            </div>
          ) : null}
          {finishing.lut.isEnabled ? (
            <div className="pointer-events-none absolute inset-0 bg-amber-500/10 mix-blend-overlay" />
          ) : null}
        </div>
      </div>
    </Card>
  );
}
