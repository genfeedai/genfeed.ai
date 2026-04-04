export enum LeadStatus {
  NEW = 'new',
  CONTACTED = 'contacted',
  QUALIFIED = 'qualified',
  PROPOSAL = 'proposal',
  NEGOTIATION = 'negotiation',
  WON = 'won',
  LOST = 'lost',
}

export enum LeadSource {
  INBOUND = 'inbound',
  OUTBOUND = 'outbound',
  REFERRAL = 'referral',
  ORGANIC = 'organic',
  PAID = 'paid',
  EVENT = 'event',
}

export enum CrmTaskStatus {
  TODO = 'todo',
  IN_PROGRESS = 'in-progress',
  DONE = 'done',
  CANCELLED = 'cancelled',
}

export enum CrmTaskPriority {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  URGENT = 'urgent',
}

export enum ProactiveOnboardingStatus {
  NONE = 'none',
  BRAND_PREPARING = 'brand_preparing',
  BRAND_READY = 'brand_ready',
  CONTENT_GENERATING = 'content_generating',
  CONTENT_READY = 'content_ready',
  /** @deprecated Use CONTENT_READY */
  READY = 'content_ready',
  INVITED = 'invited',
  STARTED = 'started',
  PAYMENT_MADE = 'payment_made',
  CONVERTED = 'converted',
}
