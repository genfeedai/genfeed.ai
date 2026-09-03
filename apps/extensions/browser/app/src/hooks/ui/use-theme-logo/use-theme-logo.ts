import { logoURL } from '~services/environment.service';

/** Popup chrome reads the CDN mark. Store toolbar icons stay local rasters. */
export function useThemeLogo(): string {
  return logoURL;
}
