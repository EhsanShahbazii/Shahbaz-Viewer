const Module = require('module');
const origRequire = Module.prototype.require;
Module.prototype.require = function(id) {
  if (id === 'vscode') {
    return {
      window: {},
      workspace: {},
      commands: {},
      Uri: { file: (f) => ({ fsPath: f }) },
    };
  }
  return origRequire.apply(this, arguments);
};

const { SqliteEngine } = require('../dist/extension');
const fs = require('fs');
const path = require('path');

async function testEngine() {
  console.log('Testing SQLite Engine...');
  const wasmDir = path.resolve(__dirname, '../dist');
  await SqliteEngine.init(wasmDir);

  const engine = new SqliteEngine();
  const dbPath = path.resolve(__dirname, '../sample.db');
  const buffer = fs.readFileSync(dbPath);
  engine.load(buffer, dbPath);

  // 1. Metadata check
  const meta = engine.getMetadata();
  console.log(`Database name: ${meta.name}`);
  console.log(`Total tables: ${meta.tables.length}`);
  console.log(`Total views: ${meta.views.length}`);
  if (meta.tables.length < 4) {
    throw new Error(`Expected at least 4 tables, got ${meta.tables.length}`);
  }

  // 2. Table data check
  const usersData = engine.getTableData('users', 0, 10);
  console.log(`Users count: ${usersData.totalRows}`);
  console.log(`Users columns: ${usersData.columns.map(c => c.name).join(', ')}`);
  if (usersData.rows.length === 0) {
    throw new Error('Expected users table to have rows!');
  }

  // 3. Foreign key check
  const ordersFk = engine.getTableForeignKeys('orders');
  console.log(`Orders FK: ${JSON.stringify(ordersFk)}`);
  if (ordersFk.length === 0 || ordersFk[0].table !== 'users') {
    throw new Error('Expected orders foreign key pointing to users!');
  }

  // 4. Query Execution check
  const queryRes = engine.executeQuery('SELECT * FROM v_customer_lifetime_value;');
  console.log(`Query execution time: ${queryRes.durationMs}ms`);
  console.log(`Query rows returned: ${queryRes.rows.length}`);
  if (queryRes.rows.length === 0) {
    throw new Error('Expected rows from v_customer_lifetime_value view!');
  }

  // 5. Explain Query Plan check
  const explain = engine.explainQuery('SELECT * FROM users WHERE email = "ada@lovelace.dev"');
  console.log(`Explain query plan items: ${explain.plan.length}`);
  console.log(`Explain advisories: ${JSON.stringify(explain.warnings)}`);

  // 6. Test Commit Changes (Transaction & Mutations)
  console.log('\nTesting Transactions & Cell Mutations...');
  const commitRes = engine.commitChanges('users', [
    {
      type: 'update',
      primaryKeyValues: { id: 1 },
      updatedValues: { full_name: 'Alexander Vance (Updated)' },
    },
    {
      type: 'insert',
      primaryKeyValues: {},
      updatedValues: {
        uuid: `usr_test_${Date.now()}`,
        username: `test.user.${Date.now()}`,
        full_name: 'New Test User',
        email: `test_${Date.now()}@example.com`,
        role: 'member',
      },
    },
  ]);
  console.log(`Commit result: ${JSON.stringify(commitRes)}`);
  if (!commitRes.success) {
    throw new Error(`Commit failed: ${commitRes.error}`);
  }

  // Verify updated row
  const updatedUser = engine.executeQuery('SELECT full_name FROM users WHERE id = 1');
  console.log(`Updated user full_name: ${updatedUser.rows[0].full_name}`);
  if (updatedUser.rows[0].full_name !== 'Alexander Vance (Updated)') {
    throw new Error('Expected updated user name!');
  }

  // 7. Test Export Utilities
  const { DataExporter, OrmGenerator } = require('../dist/extension');
  const allUsers = engine.getTableData('users', 0, 100);
  const csv = DataExporter.toCsv(allUsers.rows, allUsers.columns);
  const json = DataExporter.toJson(allUsers.rows);
  const md = DataExporter.toMarkdown(allUsers.rows, allUsers.columns);
  const ts = DataExporter.toTypeScriptInterface('users', allUsers.columns);

  console.log(`Exported CSV length: ${csv.length} chars`);
  console.log(`Exported JSON length: ${json.length} chars`);
  console.log(`Exported Markdown length: ${md.length} chars`);

  // 8. Test ORM Code Generator (Prisma, Drizzle, Zod, Python, Go)
  console.log('\nTesting ORM Code Generators for "orders" table...');
  const orderColumns = engine.getTableColumns('orders');
  const orderFks = engine.getTableForeignKeys('orders');

  const prismaCode = OrmGenerator.toPrisma('orders', orderColumns, orderFks);
  const drizzleCode = OrmGenerator.toDrizzle('orders', orderColumns, orderFks);
  const zodCode = OrmGenerator.toZod('orders', orderColumns);
  const pyCode = OrmGenerator.toPython('orders', orderColumns);
  const goCode = OrmGenerator.toGolang('orders', orderColumns);

  console.log('--- Prisma Model Snippet ---');
  console.log(prismaCode.substring(0, 200) + '...\n');

  console.log('--- Drizzle Schema Snippet ---');
  console.log(drizzleCode.substring(0, 200) + '...\n');

  if (!prismaCode.includes('model Orders') || !drizzleCode.includes('sqliteTable')) {
    throw new Error('ORM Generator output failed verification!');
  }

  // 9. Test Mock Data Generator with Referential Integrity
  console.log('Testing Mock Data Generator for "reviews"...');
  const mockRows = engine.generateMockData('reviews', 5);
  console.log(`Generated ${mockRows.length} mock review rows:`);
  console.log(`Sample mock review: ${JSON.stringify(mockRows[0])}`);

  if (mockRows.length !== 5 || !mockRows[0].product_id || !mockRows[0].user_id) {
    throw new Error('Mock Data Generator failed FK integrity verification!');
  }

  // Insert mock rows
  const insertMockRes = engine.insertMockData('reviews', mockRows);
  console.log(`Inserted mock reviews: ${JSON.stringify(insertMockRes)}`);
  if (!insertMockRes.success || insertMockRes.count !== 5) {
    throw new Error('Failed to insert mock rows!');
  }

  // 10. Test Visual Filter Rules in Engine
  console.log('\nTesting Visual Filter Rules in Engine...');
  const filteredUsers = engine.getTableData(
    'users',
    0,
    50,
    'id',
    'asc',
    '',
    [
      { id: '1', column: 'role', operator: '=', value: 'admin' },
      { id: '2', column: 'rating', operator: '>=', value: '4.0' },
      { id: '3', column: 'email', operator: 'contains', value: 'example.com' }
    ],
    'AND'
  );
  console.log(`Found ${filteredUsers.totalRows} admin users with rating >= 4.0 matching contains 'example.com'`);
  if (filteredUsers.totalRows === 0) {
    throw new Error('Expected at least 1 filtered user!');
  }
  for (const u of filteredUsers.rows) {
    if (u.role !== 'admin' || u.rating < 4.0 || !u.email.includes('example.com')) {
      throw new Error(`Filter mismatch: ${JSON.stringify(u)}`);
    }
  }

  // 11. Test CSV / JSON Data Import Wizard Engine
  console.log('\nTesting CSV / JSON Import Wizard in Engine...');
  engine.executeQuery('DROP TABLE IF EXISTS imported_leads;');
  const importRes = engine.importData({
    mode: 'new',
    targetTable: 'imported_leads',
    conflictStrategy: 'replace',
    columns: [
      { sourceName: 'lead_name', targetName: 'lead_name', type: 'TEXT', notNull: true },
      { sourceName: 'email', targetName: 'email', type: 'TEXT', notNull: true },
      { sourceName: 'budget', targetName: 'budget', type: 'REAL' },
      { sourceName: 'is_qualified', targetName: 'is_qualified', type: 'BOOLEAN' },
    ],
    rows: [
      { lead_name: 'Acme Solar', email: 'contact@acmesolar.com', budget: 15000.5, is_qualified: true },
      { lead_name: 'Stark Logistics', email: 'sales@stark.com', budget: 45000.0, is_qualified: true },
      { lead_name: 'Wayne Labs', email: 'info@waynelabs.org', budget: 9500.25, is_qualified: false },
    ],
  });

  console.log(`Import result: ${JSON.stringify(importRes)}`);
  if (!importRes.success || importRes.count !== 3) {
    throw new Error('Import failed verification!');
  }

  // Verify created table and imported records
  const leadsData = engine.getTableData('imported_leads', 0, 10);
  console.log(`Imported leads row count: ${leadsData.totalRows}`);
  if (leadsData.totalRows !== 3 || leadsData.rows[0].lead_name !== 'Acme Solar') {
    throw new Error('Imported records content mismatch!');
  }

  console.log('\n✅ ALL SQLITE ENGINE, MOCK GENERATOR, ORM, VISUAL FILTER & IMPORT WIZARD TESTS PASSED PERFECTLY!');
}

testEngine().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
