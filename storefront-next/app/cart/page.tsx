import type { Metadata } from 'next';

import { CartView } from '@/components/CartView';
import { noIndexMetadata } from '@/lib/seo';

export async function generateMetadata(): Promise<Metadata> {
  return {
    ...noIndexMetadata(),
    title: 'Корзина',
  };
}

export default function CartPage() {
  return <CartView />;
}