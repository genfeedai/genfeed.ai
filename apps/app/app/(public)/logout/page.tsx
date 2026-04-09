import type { Metadata } from 'next';
import LogoutPage from './content';

export const metadata: Metadata = {
  title: 'Sign Out | Genfeed',
};

export default function AppLogoutPage() {
  return <LogoutPage />;
}
