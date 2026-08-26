import type { OAuth2Client } from 'google-auth-library';
import type { youtube_v3 } from 'googleapis';

export type YoutubeRequestAuth =
  youtube_v3.Params$Resource$Channels$List['auth'];

export function asYoutubeRequestAuth(auth: OAuth2Client): YoutubeRequestAuth {
  // googleapis and google-auth-library can resolve duplicate type identities in
  // the monorepo, but the OAuth2 client instance is the runtime auth object.
  return auth as unknown as YoutubeRequestAuth;
}
