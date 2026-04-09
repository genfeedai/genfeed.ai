import type { Metadata } from 'next';
import LoginPage from './content';

export const metadata: Metadata = {
  title: 'Sign In | Genfeed',
};

export default function AppLoginPage() {
  return <LoginPage />;
}
