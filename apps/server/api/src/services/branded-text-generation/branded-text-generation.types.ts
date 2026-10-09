import type { TextDispatchKeyResolver } from '@api/services/byok/text-dispatch-byok.util';
import type {
  BrandedGenerationInputV1,
  BrandedGenerationReceiptV1,
  BrandLearningApplicationV1,
} from '@genfeedai/contracts/interfaces/content/branded-generation.interface';

export interface BrandedTextGenerationRequestV1 {
  /** Approved-brand text input; the caller owns the deterministic request key. */
  input: BrandedGenerationInputV1;
  /** Private learning receipt the caller already resolved for this request. */
  privateLearning: BrandLearningApplicationV1['privateAccount'];
  resolveApiKey: TextDispatchKeyResolver;
  /** Channel-limit gate applied to the provider output before anything is saved. */
  acceptText: (text: string) => boolean;
  /** Persists the exact accepted text as the artifact the receipt binds to. */
  persistText: (text: string) => Promise<{ postId: string }>;
  /** Trusted continuation check before private reads, provider work and artifact writes. */
  reauthorize?: () => Promise<void>;
  /** Creates the actual text price hold only after receipt resolution wins, before provider dispatch. */
  admitDispatch?: () => Promise<void>;
}

export type BrandedTextGenerationOutcomeV1 =
  | {
      kind: 'completed';
      receipt: BrandedGenerationReceiptV1;
      postId: string;
      /** Null when the receipt already completed on an earlier request. */
      text: string | null;
      hasNewDispatch: boolean;
    }
  | {
      kind: 'stopped';
      receipt: BrandedGenerationReceiptV1;
      postId: string | null;
      reasonCode: string;
      hasNewDispatch: boolean;
    }
  | {
      kind: 'in_progress';
      receipt: BrandedGenerationReceiptV1;
      hasNewDispatch: false;
    };
