import { SCHEMA_VERSION } from './schema.js';
import { Category } from './models/index.js';
import { newId } from './util.js';

const EXPENSE_CATEGORIES = ['Продукты', 'Кафе', 'Транспорт', 'Жильё', 'Связь', 'Здоровье', 'Развлечения', 'Одежда', 'Прочее'];
const INCOME_CATEGORIES = ['Зарплата', 'Фриланс', 'Подарки', 'Проценты'];

export function createSeedState() {
  const categories = [
    ...EXPENSE_CATEGORIES.map((name) => Category.create({ name, kind: 'expense' }).toJSON()),
    ...INCOME_CATEGORIES.map((name) => Category.create({ name, kind: 'income' }).toJSON()),
  ];

  return {
    schemaVersion: SCHEMA_VERSION,
    updatedAt: new Date().toISOString(),
    settings: { currency: 'RUB', theme: 'system' },
    accounts: [
      { id: newId(), name: 'Наличные', kind: 'cash', openingBalance: 0, archived: false },
      { id: newId(), name: 'Карта', kind: 'card', openingBalance: 0, archived: false },
    ],
    categories,
    transactions: [],
    budgets: [],
    plannedPayments: [],
    paymentOccurrences: [],
  };
}
