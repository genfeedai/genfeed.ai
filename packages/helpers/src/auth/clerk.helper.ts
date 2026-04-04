import type { IClerkPublicData } from '@genfeedai/interfaces';

type ClerkUserLike = {
  publicMetadata?: unknown;
};

export function getClerkPublicData(user: ClerkUserLike): IClerkPublicData {
  return (user.publicMetadata || {}) as unknown as IClerkPublicData;
}
