import type { Metadata } from 'next';

import { OrdersList } from '@/components/OrdersList';
import { noIndexMetadata } from '@/lib/seo';

export async function generateMetadata(): Promise<Metadata> {
  return {
    ...noIndexMetadata(),
    title: 'Мои заказы',
  };
}

export default function OrdersPage() {
  return <OrdersList />;
}