/** In-process explicit rescans; signup workflow requests keep their existing contract. */
export interface SignupPrefillOptions {
  isForced?: boolean;
  websiteUrl?: string;
  deadlineAt?: number;
}

export interface SignupPrefillSummary {
  name: string;
  description?: string;
  tone?: string;
  primaryColor?: string;
  secondaryColor?: string;
  logoUrl?: string;
}
