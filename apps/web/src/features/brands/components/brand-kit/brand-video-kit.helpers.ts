import {
  BRAND_VIDEO_FINISHING_DEFAULTS,
  type BrandVideoFinishingV1,
  OWNER_VIDEO_EVIDENCE_ID,
} from '@genfeedai/contracts/api-types/contracts';
import { BRAND_END_CARD_LIMITS } from '@genfeedai/contracts/constants';
import type { IBrand, IBrandKitDraft } from '@genfeedai/contracts/interfaces';
import type { BrandVideoRulesV1 } from '@genfeedai/contracts/interfaces/content/branded-generation.interface';
import type {
  BrandVideoKitChange,
  BrandVideoKitValue,
} from '@/features/brands/props/brand-video-kit.props';

export const VIDEO_SHOT_RULE_LIMIT = 32;
export const VIDEO_THUMBNAIL_RULE_LIMIT = 16;

const OWNER_EVIDENCE = [OWNER_VIDEO_EVIDENCE_ID];

/** What the brand row holds today, for a revision that predates the section. */
export function finishingFromBrand(brand: IBrand): BrandVideoFinishingV1 {
  return {
    endCard: {
      ...(brand.endCardAssetId ? { assetId: brand.endCardAssetId } : {}),
      durationSeconds:
        brand.endCardDurationSeconds ??
        BRAND_END_CARD_LIMITS.DEFAULT_DURATION_SECONDS,
      isEnabled: brand.isEndCardEnabled ?? false,
    },
    lut: {
      ...(brand.lutFileName ? { fileName: brand.lutFileName } : {}),
      isEnabled: brand.isLutEnabled ?? false,
    },
    watermark: {
      ...(brand.watermarkInsetXRatio != null
        ? { insetXRatio: brand.watermarkInsetXRatio }
        : {}),
      ...(brand.watermarkInsetYRatio != null
        ? { insetYRatio: brand.watermarkInsetYRatio }
        : {}),
      ...(brand.watermarkLightLogoId
        ? { lightLogoId: brand.watermarkLightLogoId }
        : {}),
      ...(brand.watermarkLiveLogoId
        ? { liveLogoId: brand.watermarkLiveLogoId }
        : {}),
      ...(brand.watermarkLogoId ? { logoId: brand.watermarkLogoId } : {}),
      opacity:
        brand.watermarkOpacity ??
        BRAND_VIDEO_FINISHING_DEFAULTS.watermarkOpacity,
      position:
        brand.watermarkPosition ??
        BRAND_VIDEO_FINISHING_DEFAULTS.watermarkPosition,
      ...(brand.watermarkSizeRatio != null
        ? { sizeRatio: brand.watermarkSizeRatio }
        : {}),
      ...(brand.watermarkText ? { text: brand.watermarkText } : {}),
    },
  };
}

/** Rule rows: the owner writes the text, the rest is fixed and the id follows the position. */
export function toOwnerRules(
  prefix: 'shot' | 'thumbnail',
  texts: readonly string[],
): BrandVideoRulesV1['shotRules'] {
  return texts
    .filter((text) => text.trim() !== '')
    .map((text, index) => ({
      evidenceIds: OWNER_EVIDENCE,
      id: `owner-video-${prefix}-${index + 1}`,
      match: 'semantic' as const,
      required: true,
      text,
    }));
}

export function ownerEvidenceIds(): string[] {
  return [...OWNER_EVIDENCE];
}

export function emptyVideoRules(): BrandVideoRulesV1 {
  return { shotRules: [], thumbnailRules: [] };
}

type VideoKitFlat = Record<string, BrandVideoKitValue>;

function percentOrNull(ratio: number | undefined): number | null {
  return ratio === undefined ? null : Math.round(ratio * 10000) / 100;
}

function flatten(content: IBrandKitDraft | null): {
  video: VideoKitFlat;
  finishing: VideoKitFlat;
} {
  const video = content?.video;
  const finishing = content?.finishing;
  return {
    video: {
      motionStyle: video?.motionStyle?.style ?? null,
      pacingTempo: video?.pacing?.tempo ?? null,
      averageShotSeconds: video?.pacing?.averageShotSeconds ?? null,
      shotRules: (video?.shotRules ?? []).map((rule) => rule.text),
      captionStyle: video?.captions?.style ?? null,
      captionPosition: video?.captions?.position ?? null,
      thumbnailRules: (video?.thumbnailRules ?? []).map((rule) => rule.text),
      logoPosition: video?.logoPlacement?.position ?? null,
      logoSize: video?.logoPlacement
        ? Math.round(video.logoPlacement.sizeRatio * 100)
        : null,
      logoAppliesTo: video?.logoPlacement?.appliesTo ?? null,
    },
    finishing: finishing
      ? {
          endCardEnabled: finishing.endCard.isEnabled,
          endCardImage: finishing.endCard.assetId ?? null,
          endCardSeconds: finishing.endCard.durationSeconds,
          lutEnabled: finishing.lut.isEnabled,
          lutFile: finishing.lut.fileName ?? null,
          watermarkText: finishing.watermark.text ?? null,
          watermarkLogo: finishing.watermark.logoId ?? null,
          watermarkLightLogo: finishing.watermark.lightLogoId ?? null,
          watermarkLiveLogo: finishing.watermark.liveLogoId ?? null,
          watermarkPosition: finishing.watermark.position,
          watermarkOpacity: Math.round(finishing.watermark.opacity * 100),
          watermarkSize: percentOrNull(finishing.watermark.sizeRatio),
          watermarkInsetX: percentOrNull(finishing.watermark.insetXRatio),
          watermarkInsetY: percentOrNull(finishing.watermark.insetYRatio),
        }
      : {},
  };
}

const IMAGE_KEYS = new Set([
  'endCardImage',
  'watermarkLogo',
  'watermarkLightLogo',
  'watermarkLiveLogo',
]);

function sameValue(a: BrandVideoKitValue, b: BrandVideoKitValue): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * What changed between the approved revision and the draft, in the order the
 * Video tab shows it. Image ids only say that an image is set or differs.
 */
export function diffVideoKit(
  approved: IBrandKitDraft | null,
  draft: IBrandKitDraft,
): BrandVideoKitChange[] {
  const before = flatten(approved);
  const after = flatten(draft);
  const changes: BrandVideoKitChange[] = [];
  for (const group of ['video', 'finishing'] as const) {
    // A revision from before finishing joined the revision has no baseline.
    if (group === 'finishing' && Object.keys(before.finishing).length === 0)
      continue;
    for (const [key, next] of Object.entries(after[group])) {
      const previous = before[group][key] ?? null;
      if (sameValue(previous, next)) continue;
      if (IMAGE_KEYS.has(key)) {
        changes.push({
          group,
          key,
          before: previous === null ? null : 'image',
          after:
            next === null
              ? null
              : previous === null
                ? 'image'
                : 'differentImage',
        });
        continue;
      }
      changes.push({ after: next, before: previous, group, key });
    }
  }
  return changes;
}
