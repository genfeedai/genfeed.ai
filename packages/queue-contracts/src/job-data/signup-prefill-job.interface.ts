/**
 * Background brand prefill scheduled once per signup.
 *
 * Emitted by the Better Auth `user.create.after` provisioning listener after
 * `UserSetupService` has created the organization + placeholder brand, and
 * consumed by the workers service. The job enriches the placeholder brand so
 * the user's *first* prompt runs against a real brand voice instead of the
 * "Default Organization" stub.
 *
 * `email` is carried so the worker can derive the brand domain itself when the
 * client never supplied one — the corporate-domain heuristic lives in
 * `@genfeedai/helpers` and is shared with the post-signup routing UI.
 */
export interface SignupPrefillJobData {
  userId: string;
  organizationId: string;
  brandId: string;
  /** Signup email, used to derive a corporate brand domain when none was given. */
  email?: string;
  /** Explicit domain handed off by the signup flow (wins over the email domain). */
  brandDomain?: string;
  /** Explicit brand name handed off by the signup flow. */
  brandName?: string;
}
