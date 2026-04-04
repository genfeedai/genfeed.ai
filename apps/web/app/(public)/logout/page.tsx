import LogoutPage from '@pages/auth/logout/logout-page';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Sign Out | Genfeed',
};

export default function AppLogoutPage() {
  return <LogoutPage />;
}
