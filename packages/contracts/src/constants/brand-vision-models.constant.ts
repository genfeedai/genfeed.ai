import { ModelProvider, PricingType } from '../enums/model.enum';

/**
 * Brand visual analysis models (#6727). The vision models that read on-screen
 * text and find logo or product regions in branded visuals are registry rows,
 * not environment variables: an operator picks one per job in Admin → Platform
 * settings, and the provider bills the price recorded on the chosen row.
 */

/** `Model.capabilities` tag of a model that reads text from an image. */
export const BRAND_OCR_CAPABILITY = 'brand-ocr';
/** `Model.capabilities` tag of a model that finds boxes for a text query. */
export const BRAND_DETECTION_CAPABILITY = 'brand-detection';

export type BrandVisionModelKind = 'detect' | 'ocr';

export const BRAND_VISION_CAPABILITY_BY_KIND: Readonly<
  Record<BrandVisionModelKind, string>
> = {
  detect: BRAND_DETECTION_CAPABILITY,
  ocr: BRAND_OCR_CAPABILITY,
};

/** `Model.key` of the registered OCR model. */
export const BRAND_VISION_OCR_MODEL_KEY = 'lucataco/florence-2-large';
/** `Model.key` of the registered open-vocabulary detector. */
export const BRAND_VISION_DETECT_MODEL_KEY = 'adirik/owlvit-base-patch32';

export interface BrandVisionCatalogModel {
  readonly capability: string;
  readonly description: string;
  /** Pinned `owner/name:version`; the version is the immutable Replicate version id. */
  readonly externalId: string;
  readonly key: string;
  readonly kind: BrandVisionModelKind;
  readonly label: string;
  readonly pricingType: PricingType.PER_SECOND;
  readonly provider: ModelProvider.REPLICATE;
  readonly providerConfig: { readonly name: string; readonly owner: string };
  /** Raw Replicate list price per second of runtime on the model's hardware. */
  readonly providerCostUsd: number;
}

/**
 * Both are public Replicate models whose latest version was pinned on
 * 2026-10-12. Replicate bills a prediction by runtime on the model's GPU:
 * Florence-2 runs on an L40S ($0.000975/s) and OWL-ViT on a T4 ($0.000225/s).
 */
export const BRAND_VISION_MODELS: readonly BrandVisionCatalogModel[] = [
  {
    capability: BRAND_OCR_CAPABILITY,
    description:
      'Florence-2 Large on an L40S GPU. Reads the text in a brand visual for mandatory and avoid literal checks.',
    externalId:
      'lucataco/florence-2-large:da53547e17d45b9cfb48174b2f18af8b83ca020fa76db62136bf9c6616762595',
    key: BRAND_VISION_OCR_MODEL_KEY,
    kind: 'ocr',
    label: 'Florence-2 Large (brand OCR)',
    pricingType: PricingType.PER_SECOND,
    provider: ModelProvider.REPLICATE,
    providerConfig: { name: 'florence-2-large', owner: 'lucataco' },
    providerCostUsd: 0.000975,
  },
  {
    capability: BRAND_DETECTION_CAPABILITY,
    description:
      'OWL-ViT base on a T4 GPU. Finds logo and product regions in a brand visual for placement checks.',
    externalId:
      'adirik/owlvit-base-patch32:5e899f155a1913c4b7304d09082d842ca7fe6cb1f22e066c83eb1d7849dc37c2',
    key: BRAND_VISION_DETECT_MODEL_KEY,
    kind: 'detect',
    label: 'OWL-ViT base (brand detection)',
    pricingType: PricingType.PER_SECOND,
    provider: ModelProvider.REPLICATE,
    providerConfig: { name: 'owlvit-base-patch32', owner: 'adirik' },
    providerCostUsd: 0.000225,
  },
];
