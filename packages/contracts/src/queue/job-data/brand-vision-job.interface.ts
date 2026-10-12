/**
 * One background brand vision check (#6727): the receipt whose OCR and placement
 * checks were left pending when its visual was first validated. The ids scope the
 * receipt read; the job carries no pixels, text or authority.
 */
export interface BrandVisionJobData {
  /** The user whose generation produced the receipt. */
  actorId: string;
  brandId: string;
  organizationId: string;
  receiptId: string;
}
