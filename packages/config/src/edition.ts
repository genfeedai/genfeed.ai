/**
 * Edition detection constants.
 *
 * IS_CLOUD: true when running as Genfeed Cloud (managed SaaS)
 * IS_EE: true when enterprise features are enabled via license key
 */

export const IS_CLOUD = !!process.env.GENFEED_CLOUD;

export const IS_EE = !!process.env.GENFEED_LICENSE_KEY;
