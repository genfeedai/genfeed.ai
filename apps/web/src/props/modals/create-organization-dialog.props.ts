import type { OrganizationsService } from '@genfeedai/services/organization/organizations.service';

export interface CreateOrganizationDialogProps {
  getOrgsService: () => Promise<OrganizationsService>;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
}
