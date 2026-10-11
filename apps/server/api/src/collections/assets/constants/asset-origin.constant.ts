/**
 * `Asset.origin` marker for an AI-generated asset whose provider output has not
 * been uploaded yet. Set at creation, cleared by the Replicate webhook once the
 * upload succeeds. Readers that resolve a displayable file (e.g. the
 * organization logo) must ignore assets carrying this marker.
 */
export const ASSET_ORIGIN_GENERATION_PENDING = 'generation:pending';

/** `Asset.origin` of a generated asset whose output has been uploaded. */
export const ASSET_ORIGIN_GENERATED = 'generation';
