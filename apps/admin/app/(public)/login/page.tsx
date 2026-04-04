import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import LoginForm from '@pages/login/login-form';

export const generateMetadata = createPageMetadata('Login');

export default function LoginPage() {
  return <LoginForm />;
}
