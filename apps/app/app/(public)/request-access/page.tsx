import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import { redirect } from 'next/navigation';

export const generateMetadata = createPageMetadata('Request Access');

const REQUEST_ACCESS_SIGNUP_PATH = '/sign-up?source=request-access';

export default function AppRequestAccessPage() {
  redirect(REQUEST_ACCESS_SIGNUP_PATH);
}
