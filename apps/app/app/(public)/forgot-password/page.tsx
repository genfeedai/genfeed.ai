import type { Metadata } from 'next';
import ForgotPasswordContent from './content';

export const metadata: Metadata = {
  title: 'Reset Password | Genfeed',
};

export default function ForgotPasswordPage() {
  return <ForgotPasswordContent />;
}
