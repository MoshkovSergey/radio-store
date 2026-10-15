import type { Metadata } from 'next';

import { AuthForm } from '@/components/AuthForm';
import { noIndexMetadata } from '@/lib/seo';

export async function generateMetadata(): Promise<Metadata> {
  return {
    ...noIndexMetadata(),
    title: 'Вход и регистрация',
  };
}

export default function LoginPage() {
  return <AuthForm />;
}