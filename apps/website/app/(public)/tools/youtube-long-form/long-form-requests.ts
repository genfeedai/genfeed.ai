import type {
  IPublicYoutubeLongFormToolResult,
  IYoutubeLongFormSourceLibraryResult,
  PublicYoutubeLongFormOutputType,
} from '@genfeedai/contracts/interfaces';
import { loadPublicService } from '../../../../packages/api/load-public-service';

/**
 * The long-form tool's API calls, imported when the visitor submits.
 *
 * The page used to mount the Better Auth client to learn whether the visitor
 * was signed in, and import the API services, before anyone had typed a URL.
 * The session is read here instead, at the moment it decides which endpoint to
 * call: signed-in visitors keep their output in their workspace, everyone else
 * gets the free preview.
 */
async function loadSignedInService() {
  const { getSignedInBetterAuthToken } = await import('@genfeedai/auth-client');
  const token = await getSignedInBetterAuthToken();

  if (!token) {
    return null;
  }

  const { YoutubeLongFormService } = await import(
    '@services/content/youtube-long-form.service'
  );
  return YoutubeLongFormService.getInstance(token);
}

export async function createLongForm(
  youtubeUrl: string,
  outputType: PublicYoutubeLongFormOutputType,
): Promise<IPublicYoutubeLongFormToolResult> {
  const signedInService = await loadSignedInService();

  if (signedInService) {
    return signedInService.create(youtubeUrl, outputType);
  }

  return (await loadPublicService()).createPublicYoutubeLongForm(
    youtubeUrl,
    outputType,
  );
}

export async function promoteSourceToLibrary(
  sourceArtifactId: string,
): Promise<IYoutubeLongFormSourceLibraryResult> {
  const signedInService = await loadSignedInService();

  if (!signedInService) {
    throw new Error('Sign in to save the source to your Library.');
  }

  return signedInService.promoteSourceToLibrary(sourceArtifactId);
}
