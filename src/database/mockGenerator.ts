import { Database } from 'sql.js';
import { ColumnInfo, ForeignKeyInfo } from '../common/messages';

const FIRST_NAMES = [
  'Emma', 'Liam', 'Olivia', 'Noah', 'Ava', 'Ethan', 'Sophia', 'Lucas', 'Isabella', 'Mason',
  'Mia', 'Oliver', 'Harper', 'Elijah', 'Evelyn', 'Aiden', 'Abigail', 'James', 'Emily', 'Alexander',
  'Charlotte', 'Benjamin', 'Amelia', 'Henry', 'Ella', 'Sebastian', 'Grace', 'Jackson', 'Chloe', 'Daniel'
];

const LAST_NAMES = [
  'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez',
  'Hernandez', 'Lopez', 'Gonzalez', 'Wilson', 'Anderson', 'Thomas', 'Taylor', 'Moore', 'Jackson', 'Martin',
  'Vance', 'Chen', 'Sterling', 'Novak', 'Dubois', 'Nakamura', 'Patel', 'Lindqvist', 'Rossi', 'Santos'
];

const COMPANIES = [
  'Acme Corp', 'Globex Systems', 'Initech LLC', 'Soylent Technologies', 'Stark Dynamics',
  'Wayne Enterprises', 'Umbrella Tech', 'Cyberdyne AI', 'Aperture Labs', 'Massive Dynamic',
  'Hooli Systems', 'Pied Piper', 'Monarch Solutions', 'Tyrell Corp', 'Weyland-Yutani'
];

const CITIES = ['San Francisco', 'New York', 'Austin', 'Seattle', 'Chicago', 'Berlin', 'London', 'Tokyo', 'Toronto', 'Sydney'];
const COUNTRIES = ['US', 'DE', 'GB', 'CA', 'FR', 'NL', 'JP', 'SE', 'CH', 'AU'];

const ADJECTIVES = ['Ultra', 'Smart', 'Pro', 'Wireless', 'Ergonomic', 'Precision', 'Hyper', 'Sonic', 'Eco', 'Quantum'];
const NOUNS = ['Hub', 'Sensor', 'Monitor', 'Dock', 'Pad', 'Terminal', 'Drive', 'Matrix', 'Link', 'Core'];

const SENTENCES = [
  'Engineered for maximum reliability and high throughput.',
  'Designed specifically for modern engineering workflows.',
  'Features seamless integration with cloud infrastructure.',
  'Built with high quality materials and exceptional craftsmanship.',
  'Optimized for low latency and zero downtime.'
];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomFloat(min: number, max: number, decimals: number = 2): number {
  return parseFloat((Math.random() * (max - min) + min).toFixed(decimals));
}

function generateUuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export class MockDataGenerator {
  public static generateRows(
    db: Database,
    tableName: string,
    columns: ColumnInfo[],
    foreignKeys: ForeignKeyInfo[],
    count: number = 10
  ): Record<string, any>[] {
    // 1. Pre-fetch valid Foreign Key values from parent tables to guarantee referential integrity
    const fkValuesMap = new Map<string, any[]>();
    for (const fk of foreignKeys) {
      try {
        const res = db.exec(`SELECT DISTINCT "${fk.to}" FROM "${fk.table}" LIMIT 100;`);
        if (res.length > 0 && res[0].values.length > 0) {
          const vals = res[0].values.map((v) => v[0]);
          fkValuesMap.set(fk.from, vals);
        }
      } catch {
        // ignore
      }
    }

    // 2. Determine autoincrementing PKs
    const primaryKeyCols = columns.filter((c) => c.pk > 0);
    const hasSingleIntegerPk =
      primaryKeyCols.length === 1 &&
      (primaryKeyCols[0].type.includes('INT') || primaryKeyCols[0].name.toLowerCase() === 'id');

    // Get max existing ID if integer PK
    let nextId = 1;
    if (hasSingleIntegerPk) {
      try {
        const idRes = db.exec(`SELECT MAX("${primaryKeyCols[0].name}") FROM "${tableName}";`);
        if (idRes.length > 0 && idRes[0].values.length > 0 && idRes[0].values[0][0] !== null) {
          nextId = Number(idRes[0].values[0][0]) + 1;
        }
      } catch {
        nextId = 1;
      }
    }

    const rows: Record<string, any>[] = [];

    for (let i = 0; i < count; i++) {
      const row: Record<string, any> = {};

      const fn = pick(FIRST_NAMES);
      const ln = pick(LAST_NAMES);

      for (const col of columns) {
        const colNameLower = col.name.toLowerCase();

        // Primary key handling
        if (hasSingleIntegerPk && col.name === primaryKeyCols[0].name) {
          row[col.name] = nextId++;
          continue;
        }

        // Foreign key handling (referential integrity guarantee)
        if (fkValuesMap.has(col.name)) {
          const validValues = fkValuesMap.get(col.name)!;
          if (validValues.length > 0) {
            row[col.name] = pick(validValues);
            continue;
          }
        }

        // Name & Identity heuristics
        if (colNameLower.includes('uuid') || colNameLower.includes('guid')) {
          row[col.name] = generateUuid();
        } else if (colNameLower === 'email' || colNameLower.endsWith('_email')) {
          row[col.name] = `${fn.toLowerCase()}.${ln.toLowerCase()}${randomInt(10, 999)}@${pick(['example.com', 'acme.org', 'devmail.io'])}`;
        } else if (colNameLower === 'username' || colNameLower.endsWith('_username')) {
          row[col.name] = `${fn.toLowerCase()}_${ln.toLowerCase()}${randomInt(1, 99)}`;
        } else if (colNameLower === 'full_name' || colNameLower === 'name' || colNameLower === 'contact_name') {
          row[col.name] = `${fn} ${ln}`;
        } else if (colNameLower === 'first_name') {
          row[col.name] = fn;
        } else if (colNameLower === 'last_name') {
          row[col.name] = ln;
        } else if (colNameLower.includes('company')) {
          row[col.name] = pick(COMPANIES);
        } else if (colNameLower.includes('phone') || colNameLower.includes('mobile')) {
          row[col.name] = `+1 (555) ${randomInt(100, 999)}-${randomInt(1000, 9999)}`;
        } else if (colNameLower.includes('sku')) {
          row[col.name] = `SKU-${randomInt(1000, 9999)}-${String.fromCharCode(65 + randomInt(0, 25))}`;
        } else if (colNameLower.includes('order_number') || colNameLower.includes('invoice_number')) {
          row[col.name] = `ORD-${new Date().getFullYear()}-${randomInt(10000, 99999)}`;
        } else if (colNameLower === 'title' || colNameLower === 'product_name') {
          row[col.name] = `${pick(ADJECTIVES)} ${pick(NOUNS)} Pro ${randomInt(1, 9)}`;
        } else if (colNameLower.includes('description') || colNameLower.includes('notes') || colNameLower.includes('comment')) {
          row[col.name] = pick(SENTENCES);
        } else if (colNameLower === 'role') {
          row[col.name] = pick(['member', 'member', 'editor', 'admin']);
        } else if (colNameLower === 'status') {
          row[col.name] = pick(['active', 'pending', 'completed']);
        } else if (colNameLower === 'tier') {
          row[col.name] = pick(['standard', 'silver', 'gold', 'platinum']);
        } else if (colNameLower === 'city') {
          row[col.name] = pick(CITIES);
        } else if (colNameLower.includes('country')) {
          row[col.name] = pick(COUNTRIES);
        } else if (colNameLower.includes('rating')) {
          row[col.name] = randomFloat(3.5, 5.0, 1);
        } else if (colNameLower.includes('price') || colNameLower.includes('cost') || colNameLower.includes('amount') || colNameLower.includes('balance') || colNameLower.includes('subtotal') || colNameLower.includes('total')) {
          row[col.name] = randomFloat(10.0, 999.0);
        } else if (colNameLower.includes('quantity') || colNameLower.includes('stock') || colNameLower.includes('count') || colNameLower.includes('views')) {
          row[col.name] = randomInt(1, 150);
        } else if (colNameLower.startsWith('is_') || colNameLower.startsWith('has_') || col.type === 'BOOLEAN') {
          row[col.name] = Math.random() > 0.3 ? 1 : 0;
        } else if (colNameLower.includes('date') || colNameLower.includes('_at') || col.type.includes('TIME') || col.type.includes('DATE')) {
          const date = new Date(Date.now() - randomInt(0, 180) * 86400000);
          row[col.name] = date.toISOString().replace('T', ' ').substring(0, 19);
        } else if (colNameLower.endsWith('_json') || colNameLower === 'json' || colNameLower.includes('metadata') || colNameLower.includes('settings')) {
          row[col.name] = JSON.stringify({
            tags: [pick(['featured', 'new', 'verified', 'sale']), pick(['tech', 'design', 'cloud'])],
            version: '1.0',
            active: true
          });
        } else if (col.type.includes('BLOB')) {
          row[col.name] = null;
        } else if (col.type.includes('INT')) {
          row[col.name] = randomInt(1, 1000);
        } else if (col.type.includes('REAL') || col.type.includes('FLOA') || col.type.includes('DOUB')) {
          row[col.name] = randomFloat(1.0, 100.0);
        } else {
          row[col.name] = `${col.name}_${randomInt(100, 999)}`;
        }
      }

      rows.push(row);
    }

    return rows;
  }
}
