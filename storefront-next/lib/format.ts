export function formatPrice(minor: number, currency: string): string {
  return `${(minor / 100).toFixed(2)} ${currency}`;
}

export function formatDate(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString('ru-RU');
}

export function formatDateShort(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString('ru-RU');
}

const ORDER_STATUS_LABELS: Record<string, string> = {
  new: 'Новый',
  processing: 'В обработке',
  paid: 'Оплачен',
  shipped: 'Отправлен',
  completed: 'Завершён',
  cancelled: 'Отменён',
};

export function orderStatusLabel(status: string): string {
  return ORDER_STATUS_LABELS[status] ?? status;
}

export function getInitials(value: string): string {
  const cleaned = value.trim();

  if (!cleaned) {
    return 'RS';
  }

  const parts = cleaned.split(/\s+/).filter(Boolean);

  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }

  return cleaned.slice(0, 2).toUpperCase();
}

export function schemaAvailability(stockQuantity: number): string {
  return stockQuantity > 0
    ? 'https://schema.org/InStock'
    : 'https://schema.org/OutOfStock';
}