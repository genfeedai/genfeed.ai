export interface BrandPublicAnalyticsSettingProps {
  isEnabled: boolean;
  isUpdating?: boolean;
  onToggle: (isEnabled: boolean) => void;
}
