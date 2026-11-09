import type {
  ICreatorTipResult,
  ICreatorTipTarget,
} from '@genfeedai/contracts/interfaces/billing';

/** The creator the support page tips, while it loads (#9716). */
export type CreatorTipTargetState =
  | { status: 'loading' }
  | { status: 'missing' }
  | { status: 'ready'; target: ICreatorTipTarget };

/** Where the reader's tip stands after they press send. */
export type CreatorTipSendState =
  | { status: 'idle' }
  | { status: 'sending' }
  | { status: 'needs-credits' }
  | { status: 'failed' }
  | { result: ICreatorTipResult; status: 'sent' };
