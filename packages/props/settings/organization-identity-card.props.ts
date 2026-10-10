export type OrganizationIdentityCardProps = {
  organizationId: string | null | undefined;
};

export type OrganizationIdentityEditorProps = {
  organization: {
    id: string;
    isOwner?: boolean;
    label: string;
    slug: string;
  };
  refreshOrganizations: () => Promise<void>;
};
