export interface SettingsOrganizationSubscriptionRouteProps {
  params: Promise<{ orgSlug: string }>;
}

export type SubscriptionStatCellProps = {
  label: string;
  value: string;
};
