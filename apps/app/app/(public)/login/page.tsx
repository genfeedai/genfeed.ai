import LoginPage from '@pages/auth/login/login-page';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Sign In | Genfeed',
};

export default function AppLoginPage() {
  return <LoginPage />;
}
