const ATTRIBUTE_LABELS: Record<string, string> = {
  type: 'Тип',
  package: 'Корпус',
  tolerance: 'Допуск',
  resistance: 'Сопротивление',
  capacitance: 'Ёмкость',
  voltage: 'Напряжение',
  current: 'Ток',
  power: 'Мощность',
  frequency: 'Частота',
  family: 'Семейство',
  core: 'Ядро',
  flash: 'Flash-память',
  ram: 'ОЗУ',
  pins: 'Количество выводов',
  wireless: 'Беспроводные интерфейсы',
  interface: 'Интерфейс',
  temperature: 'Температурный диапазон',
  lead_free: 'Без свинца',
  rohs: 'RoHS',
  datasheet: 'Документация',
  footprint: 'Посадочное место',
  polarity: 'Полярность',
  dielectric: 'Диэлектрик',
  esr: 'ESR',
  ripple_current: 'Пульсирующий ток',
  lifecycle: 'Жизненный цикл',
  msd: 'Уровень чувствительности к влаге',
};

export function attributeLabel(key: string): string {
  return ATTRIBUTE_LABELS[key] ?? key;
}

export function formatAttributeValue(value: unknown): string {
  if (value === null || value === undefined) {
    return '—';
  }

  if (Array.isArray(value)) {
    return value.map((item) => String(item)).join(', ');
  }

  if (typeof value === 'object') {
    return JSON.stringify(value);
  }

  return String(value);
}

export function getAttributeEntries(
  attributes: Record<string, unknown> | undefined,
): Array<[string, string]> {
  if (!attributes) {
    return [];
  }

  return Object.entries(attributes).map(([key, value]) => [
    attributeLabel(key),
    formatAttributeValue(value),
  ]);
}