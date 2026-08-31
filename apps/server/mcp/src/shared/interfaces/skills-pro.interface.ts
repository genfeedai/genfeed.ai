export interface SkillsProEntitlement {
  email: string;
  productType: string;
  skills: string[];
  valid: boolean;
}

export interface SkillsProInstallation {
  id: string;
  name: string;
  slug: string;
  status: string;
  version: string;
}
