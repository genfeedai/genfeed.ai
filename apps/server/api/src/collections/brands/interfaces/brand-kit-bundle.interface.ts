import type { BrandKitSlot } from '@genfeedai/contracts';
import type { BrandKitBundleManifest } from '@genfeedai/contracts/api-types/contracts/brand-kit-bundle.contract';

/** One image written into a logo variant or platform image slot. */
export interface BrandKitSlotImageWrite {
  brandId: string;
  organizationId: string;
  userId: string;
  role: 'logo' | 'banner';
  slot: BrandKitSlot;
  bytes: Buffer;
  mimeType: string;
  /** Where the image came from, recorded on the asset row. */
  origin: string;
}

/** An uploaded brand kit ZIP, read. */
export interface UnpackedBrandKitBundle {
  manifest: BrandKitBundleManifest;
  /** The files the manifest names, by their path inside the ZIP. */
  files: Map<string, Buffer>;
}

/** A brand kit ZIP ready to download. */
export interface BrandKitBundleDownload {
  fileName: string;
  bytes: Buffer;
}
