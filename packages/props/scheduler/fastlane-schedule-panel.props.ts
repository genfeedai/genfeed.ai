import type {
  FastlaneAssetItem,
  FastlaneScheduleTarget,
  ICredential,
} from '@genfeedai/contracts/interfaces';

export interface FastlaneSchedulePanelOnScheduleParams {
  assets: FastlaneAssetItem[];
  captions: Record<string, string>;
  postingSetId?: string;
  targets: FastlaneScheduleTarget[];
  timezone: string;
}

export interface FastlaneSchedulePanelProps {
  assets: FastlaneAssetItem[];
  brandId: string;
  credentials: ICredential[];
  isScheduling: boolean;
  onSchedule: (params: FastlaneSchedulePanelOnScheduleParams) => void;
  timezone: string;
}

export interface FastlaneCredentialTarget extends FastlaneScheduleTarget {
  isSelected: boolean;
}
