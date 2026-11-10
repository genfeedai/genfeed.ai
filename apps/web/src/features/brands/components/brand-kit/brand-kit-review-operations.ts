import type {
  BrandKitReviewOperationsAction,
  BrandKitReviewOperationsState,
} from '@/features/brands/props/brand-kit-review.props';

export const INITIAL_BRAND_KIT_REVIEW_OPERATIONS: BrandKitReviewOperationsState =
  { error: null, pending: new Set() };

/**
 * Scan, apply and asset import as one reducer (#9743). A failure records which
 * step raised it; the draft, values and selections stay with the hook, so a
 * failed apply never loses the draft under review.
 */
export function brandKitReviewOperationsReducer(
  state: BrandKitReviewOperationsState,
  action: BrandKitReviewOperationsAction,
): BrandKitReviewOperationsState {
  switch (action.type) {
    case 'start': {
      const pending = new Set(state.pending);
      pending.add(action.operation);
      return { error: null, pending };
    }
    case 'finish': {
      if (!state.pending.has(action.operation)) {
        return state;
      }
      const pending = new Set(state.pending);
      pending.delete(action.operation);
      return { ...state, pending };
    }
    case 'fail':
      return {
        ...state,
        error: { message: action.message, operation: action.operation },
      };
  }
}
