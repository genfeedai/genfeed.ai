import type { Metadata } from 'next';
import ForgotPasswordContent from './content';

export const metadata: Metadata = {
  alternates: { canonical: 'https://app.genfeed.ai/forgot-password' },
  description:
    'Reset your Genfeed password securely and regain access to your content studio, brand assets, publishing tools, and workspace settings.',
  title: 'Reset Your Genfeed Account Password',
  twitter: { card: 'summary' },
};

export default function ForgotPasswordPage() {
  return <ForgotPasswordContent />;
}
