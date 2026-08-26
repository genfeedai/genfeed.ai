export type BrandOsFunnelStage =
  | 'draft_accepted'
  | 'draft_saved'
  | 'first_generation';

const KEY_PREFIX = 'genfeed.brand-os.funnel.v1';
const ACCEPTED_KEY = `${KEY_PREFIX}:accepted`;
const claimedStages = new Set<BrandOsFunnelStage>();
let acceptedInMemory = false;

function getStorage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function claimBrandOsFunnelStage(stage: BrandOsFunnelStage): boolean {
  if (claimedStages.has(stage)) {
    return false;
  }
  const storage = getStorage();
  try {
    const key = `${KEY_PREFIX}:${stage}`;
    if (storage?.getItem(key) === '1') {
      claimedStages.add(stage);
      return false;
    }
    storage?.setItem(key, '1');
  } catch {
    // In-memory dedupe still protects the current session.
  }
  claimedStages.add(stage);
  return true;
}

export function markBrandOsDraftAccepted(): void {
  acceptedInMemory = true;
  try {
    getStorage()?.setItem(ACCEPTED_KEY, '1');
  } catch {
    // Analytics dedupe must never block the accepted review action.
  }
}

export function hasAcceptedBrandOsDraft(): boolean {
  if (acceptedInMemory) {
    return true;
  }
  try {
    acceptedInMemory = getStorage()?.getItem(ACCEPTED_KEY) === '1';
    return acceptedInMemory;
  } catch {
    return false;
  }
}
