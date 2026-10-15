import type { Metadata } from 'next';

import { OrderDetails } from '@/components/OrderDetails';
import { noIndexMetadata } from '@/lib/seo';

export async function generateMetadata(): Promise<Metadata> {
  return {
    ...noIndexMetadata(),
    title: 'Заказ',
  };
}

export default async function OrderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const orderId = Number(id);

  return <OrderDetails orderId={orderId} />;
}