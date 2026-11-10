import type { IBrandKitDiagnostic } from '@genfeedai/contracts/interfaces';

export interface IBrandKitAssetCandidateValidation {
  diagnostics: IBrandKitDiagnostic[];
  isSvg: boolean;
  mimeType?: string;
  url: URL;
}
