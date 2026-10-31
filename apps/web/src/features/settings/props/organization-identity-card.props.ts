export type OrganizationIdentityCardProps = {
  organizationId: string | null | undefined;
};

export type OrganizationIdentityEditorProps = {
  isGeneratingLogo: boolean;
  logoUrl: string | null;
  onGenerateLogo: () => void;
  onUploadLogo: () => void;
  organization: {
    id: string;
    isOwner?: boolean;
    label: string;
    slug: string;
  };
  refreshOrganizations: () => Promise<void>;
};
