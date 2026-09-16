/**
 * Run-level identity lock for the clip-chain long-form video workflow (#4653).
 *
 * The character is required for the identity path; product and environment
 * stills are optional. The ids are resolved once at instantiation and reused
 * verbatim on every segment generate — regenerating a sheet mid-run is out of
 * contract, change ids only by starting a new run.
 */
export interface ClipChainIdentityIngredientIds {
  characterIngredientIds: readonly string[];
  environmentIngredientIds?: readonly string[];
  productIngredientIds?: readonly string[];
}

/**
 * Generation-brief roles an identity still may carry on a video request.
 * Environment / location sheets ride as an extra `subject` still until a
 * location object exists.
 */
export type ClipChainIdentityRole = 'character' | 'product' | 'subject';

export interface ClipChainIdentityReference {
  assetId: string;
  role: ClipChainIdentityRole;
}

export type VideoGenerationFrameRole = 'first_frame' | 'last_frame';

/**
 * What a `videoGen` segment actually sent once the selected model's capability
 * profile was consulted. `omittedFrameRoles` records a skipped motion handoff
 * (identity stills win over the frame role); `omittedReferences` records
 * identity stills the model had no slot for.
 */
export interface VideoGenerationIdentityLock {
  omittedFrameRoles: VideoGenerationFrameRole[];
  omittedReferences: ClipChainIdentityReference[];
  reason?: string;
  references: ClipChainIdentityReference[];
}
