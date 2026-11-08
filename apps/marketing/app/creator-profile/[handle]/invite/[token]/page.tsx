import type { Metadata } from 'next';
import InviteProfile from './invite-profile';

/**
 * The link is the credential: keep it out of search results, never pass it on
 * as a referrer, and name nothing about the brand in the head, since a link
 * unfurler shows the head to whoever the link is pasted next to.
 */
export const metadata: Metadata = {
  referrer: 'no-referrer',
  robots: { follow: false, index: false },
  title: 'Your profile | Genfeed',
};

export default async function InviteProfilePage({
  params,
}: {
  params: Promise<{ handle: string; token: string }>;
}) {
  const { handle, token } = await params;
  return <InviteProfile handle={handle} token={token} />;
}
