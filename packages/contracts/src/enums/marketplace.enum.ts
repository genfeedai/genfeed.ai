export enum ListingType {
  WORKFLOW = 'workflow',
  PROMPT = 'prompt',
  PRESET = 'preset',
  SKILL = 'skill',
}

export enum ListingStatus {
  DRAFT = 'draft',
  PENDING_REVIEW = 'pending_review',
  PUBLISHED = 'published',
  REJECTED = 'rejected',
  ARCHIVED = 'archived',
}

export enum SellerBadgeTier {
  NEW = 'new',
  VERIFIED = 'verified',
  TOP_SELLER = 'top_seller',
}

export enum SellerStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  SUSPENDED = 'suspended',
}

export enum PurchaseStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  REFUNDED = 'refunded',
  DISPUTED = 'disputed',
}

export enum PayoutStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

export enum ReviewStatus {
  ACTIVE = 'active',
  HIDDEN = 'hidden',
  FLAGGED = 'flagged',
}

export enum PricingTier {
  FREE = 'free',
  PAID = 'paid',
  PREMIUM = 'premium',
}
