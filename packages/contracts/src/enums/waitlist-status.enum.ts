/** Where a waitlist entry stands. Persisted as lowercase text on `waitlist_entries.status`. */
export enum WaitlistStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
}
