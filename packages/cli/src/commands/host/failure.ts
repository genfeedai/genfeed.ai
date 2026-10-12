import type { NativeHostFailureCode } from '@genfeedai/contracts/api-types/contracts/native-host.contract';

/** A request the host stops on purpose; the message is safe to show a user. */
export class HostFailure extends Error {
  constructor(
    readonly code: NativeHostFailureCode,
    message: string
  ) {
    super(message);
    this.name = 'HostFailure';
  }
}
