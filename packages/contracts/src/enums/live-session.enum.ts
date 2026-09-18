export enum LiveSessionStatus {
  OPEN = 'OPEN',
  TERMINATED = 'TERMINATED',
}

export enum LiveSessionTerminateReason {
  CEILING = 'ceiling',
  USER = 'user',
}

export function parseLiveSessionStatus(
  value: string | null | undefined,
): LiveSessionStatus {
  switch (value) {
    case LiveSessionStatus.TERMINATED:
      return LiveSessionStatus.TERMINATED;
    default:
      return LiveSessionStatus.OPEN;
  }
}

export function parseLiveSessionTerminateReason(
  value: string | null | undefined,
): LiveSessionTerminateReason | null {
  switch (value) {
    case LiveSessionTerminateReason.CEILING:
      return LiveSessionTerminateReason.CEILING;
    case LiveSessionTerminateReason.USER:
      return LiveSessionTerminateReason.USER;
    default:
      return null;
  }
}
