import type { Metadata } from 'next';
import ResetPasswordContent from './content';

export const metadata: Metadata = {
  title: 'Choose New Password | Genfeed',
};

export default function ResetPasswordPage() {
  return <ResetPasswordContent />;
}
