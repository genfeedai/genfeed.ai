import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import SignUpBetterAuth from '../sign-up-better-auth';

export const generateMetadata = createPageMetadata(
  'Create a Genfeed Account with Email',
  '/sign-up/password',
);

export default function SignUpPasswordPage() {
  return <SignUpBetterAuth mode="password" />;
}
