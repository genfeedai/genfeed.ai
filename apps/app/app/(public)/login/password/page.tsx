import type { Metadata } from 'next';
import LoginBetterAuth from '../login-better-auth';

export const metadata: Metadata = {
  title: 'Password Sign In | Genfeed',
};

export default function PasswordLoginPage() {
  return <LoginBetterAuth mode="password" />;
}
