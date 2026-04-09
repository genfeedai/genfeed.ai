import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import SignUpForm from './sign-up-form';

export const generateMetadata = createPageMetadata('Sign Up');

export default function AppSignUpPage() {
  return <SignUpForm />;
}
