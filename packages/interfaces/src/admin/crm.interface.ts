export interface ICrmLead {
  id: string;
  _id?: string;
  name: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  company?: string | ICrmCompany;
  companyRef?: string;
  title?: string;
  status: string;
  source?: string;
  dealValue?: number;
  notes?: string;
  tags?: string[];
  assignedTo?: string;
  lastContactedAt?: string;
  nextFollowUpAt?: string;
  twitterHandle?: string;
  instagramHandle?: string;
  discordHandle?: string;
  telegramHandle?: string;
  contactDate?: string;
  currency?: string;
  productOffering?: string;
  order?: number;
  brandUrl?: string;
  proactiveOrganization?: string;
  proactiveBrand?: string;
  proactiveStatus?: string;
  proactiveBatchId?: string;
  invitedAt?: string;
  convertedAt?: string;
  paymentMadeAt?: string;
  isDeleted: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface IProactivePreparationStatus {
  proactiveStatus: string;
  brand?: {
    id: string;
    name: string;
    colors?: string[];
    voiceTone?: string;
  };
  batch?: {
    id: string;
    totalPosts: number;
    completedPosts: number;
    platforms: string[];
  };
  invitation?: {
    invitedAt: string;
    email: string;
  };
  organization?: {
    id: string;
    label: string;
  };
  claimedAt?: string;
  paymentMadeAt?: string;
}

export interface ICrmCompany {
  id: string;
  _id?: string;
  name: string;
  website?: string;
  domain?: string;
  industry?: string;
  size?: string;
  status?: string;
  billingType?: string;
  notes?: string;
  twitterHandle?: string;
  instagramHandle?: string;
  avatarUrl?: string;
  isDeleted: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ICrmTask {
  id: string;
  _id?: string;
  title: string;
  description?: string;
  status: string;
  priority: string;
  lead?: string | ICrmLead;
  company?: string | ICrmCompany;
  assignedTo?: string;
  dueDate?: string;
  isDeleted: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ICrmLeadActivity {
  id: string;
  _id?: string;
  createdBy: string;
  description: string;
  lead: string;
  metadata?: Record<string, unknown>;
  type: string;
  createdAt: string;
  updatedAt: string;
}

export interface IMarginSummary {
  costs: number;
  revenue: number;
  margin: number;
}

export interface IMonthlyMargin {
  month: string;
  revenue: number;
  replicateCost: number;
  modelsCost: number;
  otherCost: number;
  totalCosts: number;
  margin: number;
  marginPercentage: number;
}

export interface ICrmAnalytics {
  funnel: { stage: string; count: number; percentage: number }[];
  velocity: { date: string; count: number }[];
  sources: { source: string; count: number }[];
  avgTimePerStage: { stage: string; avgDays: number }[];
}

export interface ICrmAlignmentRule {
  id: string;
  _id?: string;
  key: string;
  label: string;
  definition: string;
  owner: string;
  status: 'draft' | 'approved' | 'deprecated';
  notes?: string;
  effectiveDate?: string;
  lastReviewedAt?: string;
  isDeleted: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ICrmAlignmentIssue {
  code: string;
  description: string;
  severity: 'low' | 'medium' | 'high';
  metric: number;
}

export interface ICrmAlignmentSummary {
  totalLeads: number;
  completeLeads: number;
  leadsMissingRequired: number;
  completenessPercentage: number;
  staleRules: number;
  openIssues: ICrmAlignmentIssue[];
}

export interface ICrmAlignmentValidation {
  generatedAt: string;
  summary: ICrmAlignmentSummary;
  sampledLeadIds: string[];
}
