const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

// Helper to generate a mini valid PNG buffer with custom RGB color
function createColoredPng(r, g, b) {
  // 4x4 PNG buffer with valid header, IHDR, IDAT, and IEND
  // We can also create simple 1x1 colored PNGs
  // 1x1 PNG: Header (8) + IHDR (25) + IDAT (17) + IEND (12) = 62 bytes
  // Pre-calculated template for 1x1 24-bit RGB PNG
  const p1 = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, // PNG signature
    0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, // IHDR chunk
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, // 1x1 dimensions
    0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53, 0xde, // 8-bit RGB, CRC
    0x00, 0x00, 0x00, 0x0c, 0x49, 0x44, 0x41, 0x54, // IDAT chunk (12 bytes)
    0x08, 0xd7, 0x63, 0xf8, 0xcf, 0xc0, 0x00, 0x00, 0x03, 0x01, 0x01, 0x00, 0x18, 0xdd, 0x8d, 0xb0,
    0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82 // IEND chunk
  ]);
  return p1;
}

// Random helpers
const randomChoice = (arr) => arr[Math.floor(Math.random() * arr.length)];
const randomInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const randomFloat = (min, max, decimals = 2) =>
  parseFloat((Math.random() * (max - min) + min).toFixed(decimals));

async function createEnrichedDb() {
  console.log('Generating enriched SQLite database...');
  const wasmBinary = fs.readFileSync(path.join(__dirname, '../dist/sql-wasm.wasm'));
  const SQL = await initSqlJs({ wasmBinary });
  const db = new SQL.Database();

  // 1. DDL Schema Definition
  db.run(`
    -- USERS
    CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      uuid TEXT NOT NULL UNIQUE,
      username TEXT NOT NULL UNIQUE,
      full_name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      role TEXT CHECK(role IN ('admin', 'editor', 'member', 'guest')) DEFAULT 'member',
      status TEXT CHECK(status IN ('active', 'suspended', 'pending')) DEFAULT 'active',
      is_verified INTEGER DEFAULT 1,
      rating REAL DEFAULT 5.0,
      avatar_blob BLOB,
      profile_json TEXT,
      last_login_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      deleted_at DATETIME
    );

    -- CATEGORIES (Hierarchical with self-referential foreign key)
    CREATE TABLE categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      parent_id INTEGER,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      description TEXT,
      display_order INTEGER DEFAULT 0,
      icon_name TEXT,
      FOREIGN KEY (parent_id) REFERENCES categories(id) ON DELETE SET NULL
    );

    -- PRODUCTS
    CREATE TABLE products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sku TEXT NOT NULL UNIQUE,
      category_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      price REAL NOT NULL,
      cost_price REAL NOT NULL,
      stock_quantity INTEGER DEFAULT 0,
      is_published INTEGER DEFAULT 1,
      rating REAL DEFAULT 0.0,
      reviews_count INTEGER DEFAULT 0,
      tags_json TEXT,
      dimensions_json TEXT,
      thumbnail_blob BLOB,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (category_id) REFERENCES categories(id)
    );

    -- CUSTOMERS
    CREATE TABLE customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_name TEXT,
      contact_name TEXT NOT NULL,
      email TEXT NOT NULL,
      phone TEXT,
      tier TEXT CHECK(tier IN ('standard', 'silver', 'gold', 'platinum')) DEFAULT 'standard',
      credit_limit REAL DEFAULT 1000.0,
      balance REAL DEFAULT 0.0,
      address_json TEXT,
      country_code TEXT DEFAULT 'US',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- ORDERS
    CREATE TABLE orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_number TEXT NOT NULL UNIQUE,
      customer_id INTEGER NOT NULL,
      assigned_agent_id INTEGER,
      status TEXT CHECK(status IN ('pending', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded')) DEFAULT 'pending',
      subtotal REAL NOT NULL,
      tax_amount REAL NOT NULL,
      shipping_fee REAL DEFAULT 0.0,
      discount_amount REAL DEFAULT 0.0,
      total_amount REAL NOT NULL,
      payment_method TEXT CHECK(payment_method IN ('credit_card', 'paypal', 'apple_pay', 'crypto', 'invoice')) DEFAULT 'credit_card',
      payment_status TEXT CHECK(payment_status IN ('paid', 'unpaid', 'refunded')) DEFAULT 'unpaid',
      shipping_address_json TEXT,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      shipped_at DATETIME,
      FOREIGN KEY (customer_id) REFERENCES customers(id),
      FOREIGN KEY (assigned_agent_id) REFERENCES users(id)
    );

    -- ORDER ITEMS
    CREATE TABLE order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      quantity INTEGER NOT NULL CHECK(quantity > 0),
      unit_price REAL NOT NULL,
      discount_pct REAL DEFAULT 0.0,
      total_price REAL NOT NULL,
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
      FOREIGN KEY (product_id) REFERENCES products(id)
    );

    -- PRODUCT REVIEWS
    CREATE TABLE reviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      rating INTEGER NOT NULL CHECK(rating >= 1 AND rating <= 5),
      title TEXT NOT NULL,
      comment TEXT,
      is_verified_purchase INTEGER DEFAULT 1,
      helpful_votes INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    -- DAILY SALES METRICS (For beautiful charts & visualizer)
    CREATE TABLE daily_sales_metrics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      report_date DATE NOT NULL UNIQUE,
      total_revenue REAL NOT NULL,
      orders_count INTEGER NOT NULL,
      average_order_value REAL NOT NULL,
      new_customers INTEGER NOT NULL,
      discount_total REAL NOT NULL,
      refund_amount REAL NOT NULL,
      traffic_visits INTEGER NOT NULL,
      conversion_rate_pct REAL NOT NULL
    );

    -- SERVER PERFORMANCE LOGS (Heavy data table for stress testing and charts)
    CREATE TABLE server_performance_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp DATETIME NOT NULL,
      server_node TEXT NOT NULL,
      region TEXT NOT NULL,
      cpu_usage_pct REAL NOT NULL,
      memory_usage_pct REAL NOT NULL,
      latency_ms REAL NOT NULL,
      requests_per_sec INTEGER NOT NULL,
      error_count INTEGER NOT NULL
    );

    -- AUDIT LOGS
    CREATE TABLE audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id INTEGER NOT NULL,
      actor_id INTEGER,
      ip_address TEXT,
      user_agent TEXT,
      changes_json TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (actor_id) REFERENCES users(id)
    );

    -- SYSTEM CONFIGURATION
    CREATE TABLE system_settings (
      key TEXT PRIMARY KEY,
      value_json TEXT NOT NULL,
      category TEXT NOT NULL,
      is_public INTEGER DEFAULT 0,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- INDEXES
    CREATE INDEX idx_users_email ON users(email);
    CREATE INDEX idx_products_category ON products(category_id);
    CREATE INDEX idx_orders_customer ON orders(customer_id);
    CREATE INDEX idx_orders_status ON orders(status);
    CREATE INDEX idx_order_items_order ON order_items(order_id);
    CREATE INDEX idx_reviews_product ON reviews(product_id);
    CREATE INDEX idx_daily_sales_date ON daily_sales_metrics(report_date);
    CREATE INDEX idx_perf_timestamp ON server_performance_logs(timestamp);

    -- ANALYTICAL VIEWS
    CREATE VIEW v_customer_lifetime_value AS
    SELECT 
      c.id AS customer_id,
      c.contact_name,
      c.company_name,
      c.tier,
      COUNT(o.id) AS total_orders,
      COALESCE(SUM(o.total_amount), 0.0) AS lifetime_spend,
      COALESCE(AVG(o.total_amount), 0.0) AS average_order_value,
      MAX(o.created_at) AS last_order_date
    FROM customers c
    LEFT JOIN orders o ON c.id = o.customer_id
    GROUP BY c.id, c.contact_name, c.company_name, c.tier;

    CREATE VIEW v_product_performance AS
    SELECT 
      p.id AS product_id,
      p.sku,
      p.title,
      c.name AS category_name,
      p.price,
      p.stock_quantity,
      COALESCE(SUM(oi.quantity), 0) AS total_units_sold,
      COALESCE(SUM(oi.total_price), 0.0) AS total_revenue,
      COALESCE(AVG(r.rating), 0.0) AS avg_rating,
      COUNT(DISTINCT r.id) AS review_count
    FROM products p
    JOIN categories c ON p.category_id = c.id
    LEFT JOIN order_items oi ON p.id = oi.product_id
    LEFT JOIN reviews r ON p.id = r.product_id
    GROUP BY p.id, p.sku, p.title, c.name, p.price, p.stock_quantity;
  `);

  console.log('Schema, views, and indexes created.');

  // 2. Insert Categories (Hierarchical)
  const mainCategories = [
    ['Computers & Laptops', 'computers-laptops', 'High-performance computing, laptops, and workstations', 'device-desktop', null],
    ['Smartphones & Tablets', 'smartphones-tablets', 'Latest flagship phones, folding devices, and slates', 'device-mobile', null],
    ['Audio & Acoustics', 'audio-acoustics', 'Audiophile headphones, DACs, and studio monitors', 'unmute', null],
    ['Gaming & VR', 'gaming-vr', 'Consoles, PC gaming accessories, and VR headsets', 'game', null],
    ['Workspace & Furniture', 'workspace-furniture', 'Ergonomic chairs, sit-stand desks, and lighting', 'home', null],
    ['Smart Home & IoT', 'smart-home-iot', 'Connected sensors, cameras, and hubs', 'radio-tower', null]
  ];

  const catStmt = db.prepare(`INSERT INTO categories (name, slug, description, icon_name, parent_id) VALUES (?, ?, ?, ?, ?);`);
  mainCategories.forEach(c => catStmt.run(c));

  // Subcategories
  const subCategories = [
    ['Ultrabooks', 'ultrabooks', 'Lightweight portable powerhouses', 'laptop', 1],
    ['Workstations', 'workstations', 'Desktop towers for rendering and AI', 'server', 1],
    ['Headphones', 'headphones', 'Closed and open-back planar monitors', 'headset', 3],
    ['Studio Monitors', 'studio-monitors', 'Nearfield active speakers for mastering', 'output', 3],
    ['Mechanical Keyboards', 'keyboards', 'Custom switches, hot-swap PCB plates', 'keyboard', 4],
    ['Ergonomic Chairs', 'chairs', 'Active lumbar mesh seating', 'archive', 5],
    ['Smart Lighting', 'smart-lighting', 'Tunable white and color light bars', 'lightbulb', 6]
  ];
  subCategories.forEach(c => catStmt.run(c));
  catStmt.free();
  console.log('Inserted 13 categories.');

  // 3. Insert Users (50 realistic users)
  const firstNames = ['Sophia', 'Liam', 'Olivia', 'Noah', 'Emma', 'Jackson', 'Ava', 'Aiden', 'Isabella', 'Lucas', 'Mia', 'Ethan', 'Harper', 'Mason', 'Evelyn', 'Oliver', 'Amelia', 'Elijah', 'Abigail', 'Logan', 'Emily', 'Alexander', 'Elizabeth', 'James', 'Mila', 'Benjamin'];
  const lastNames = ['Chen', 'Smith', 'Tremblay', 'Patel', 'Mueller', 'Garcia', 'Nakamura', 'Kim', 'Johansson', 'Dubois', 'Silva', 'Rossi', 'Kowalski', 'Novak', 'Larsen', 'Fischer', 'O\'Connor', 'Tanaka', 'Santos', 'Meyer'];

  const userStmt = db.prepare(`
    INSERT INTO users (uuid, username, full_name, email, role, status, is_verified, rating, avatar_blob, profile_json, last_login_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
  `);

  const userIds = [];
  for (let i = 1; i <= 50; i++) {
    const fn = firstNames[(i * 3) % firstNames.length];
    const ln = lastNames[(i * 7) % lastNames.length];
    const username = `${fn.toLowerCase()}.${ln.toLowerCase()}${i}`;
    const email = `${username}@example.com`;
    const role = i <= 3 ? 'admin' : (i <= 12 ? 'editor' : (i <= 45 ? 'member' : 'guest'));
    const status = i === 13 ? 'suspended' : (i === 22 ? 'pending' : 'active');
    const rating = randomFloat(4.1, 5.0, 1);
    const profile = JSON.stringify({
      title: i % 2 === 0 ? 'Lead Systems Architect' : 'Senior Product Operations',
      department: randomChoice(['Engineering', 'Product', 'DevOps', 'Customer Success', 'Security']),
      skills: ['TypeScript', 'SQLite', 'Docker', 'Kubernetes'].slice(0, randomInt(2, 4)),
      preferences: { dark_mode: true, notifications_email: true }
    });
    const avatar = createColoredPng(randomInt(30, 220), randomInt(30, 220), randomInt(30, 220));
    const created = `2025-0${randomInt(1, 9)}-${randomInt(10, 28)} 10:14:00`;
    const lastLogin = `2026-03-0${randomInt(1, 6)} ${randomInt(10, 22)}:${randomInt(10, 59)}:00`;

    userStmt.run([
      `usr-${1000 + i}-uuid`,
      username,
      `${fn} ${ln}`,
      email,
      role,
      status,
      1,
      rating,
      avatar,
      profile,
      lastLogin,
      created
    ]);
    userIds.push(i);
  }
  userStmt.free();
  console.log(`Inserted 50 users.`);

  // 4. Insert Customers (100 corporate & enterprise accounts)
  const companyPrefixes = ['Apex', 'Nexus', 'Quantum', 'Horizon', 'Vanguard', 'Starlight', 'Aero', 'Cobalt', 'Zenith', 'Hyperion', 'Vertex', 'Pulse', 'Synapse'];
  const companySuffixes = ['Technologies', 'Dynamics', 'Robotics', 'Systems', 'Labs', 'Logistics', 'Solutions', 'Holdings', 'Networks', 'Global'];

  const customerStmt = db.prepare(`
    INSERT INTO customers (company_name, contact_name, email, phone, tier, credit_limit, balance, address_json, country_code, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
  `);

  const customerIds = [];
  for (let i = 1; i <= 100; i++) {
    const comp = `${companyPrefixes[i % companyPrefixes.length]} ${companySuffixes[(i * 3) % companySuffixes.length]}`;
    const fn = firstNames[(i * 5) % firstNames.length];
    const ln = lastNames[(i * 2) % lastNames.length];
    const tier = i <= 10 ? 'platinum' : (i <= 30 ? 'gold' : (i <= 65 ? 'silver' : 'standard'));
    const credit = tier === 'platinum' ? 100000.0 : (tier === 'gold' ? 35000.0 : (tier === 'silver' ? 10000.0 : 2500.0));
    const balance = randomFloat(0, credit * 0.45);
    const country = randomChoice(['US', 'CA', 'DE', 'GB', 'FR', 'JP', 'AU', 'NL', 'SE', 'CH']);

    const address = JSON.stringify({
      street: `${randomInt(100, 9999)} Innovation Parkway Suite ${randomInt(100, 800)}`,
      city: randomChoice(['San Francisco', 'Berlin', 'Tokyo', 'London', 'Toronto', 'Sydney', 'Stockholm', 'Zurich']),
      postal_code: `${randomInt(10000, 99999)}`,
      tax_id: `VAT-${country}-${randomInt(10000000, 99999999)}`
    });

    customerStmt.run([
      comp,
      `${fn} ${ln}`,
      `orders@${comp.toLowerCase().replace(/\s+/g, '')}.com`,
      `+1 (555) ${randomInt(100, 999)}-${randomInt(1000, 9999)}`,
      tier,
      credit,
      balance,
      address,
      country,
      `2025-0${randomInt(1, 9)}-${randomInt(10, 28)} 09:00:00`
    ]);
    customerIds.push(i);
  }
  customerStmt.free();
  console.log(`Inserted 100 customers.`);

  // 5. Insert Products (100 premium products)
  const productBases = [
    { title: 'MacBook Pro 16" M3 Max 64GB', cat: 7, price: 3499.00, cost: 2450.00, tags: ['laptop', 'apple', 'm3', 'creative'] },
    { title: 'ThinkPad X1 Carbon Gen 12', cat: 7, price: 1899.00, cost: 1250.00, tags: ['laptop', 'lenovo', 'business', 'ultralight'] },
    { title: 'Framework Laptop 16 Modular', cat: 7, price: 2199.00, cost: 1500.00, tags: ['laptop', 'modular', 'repairable', 'linux'] },
    { title: 'Threadripper PRO 7995WX Workstation', cat: 8, price: 8999.00, cost: 6800.00, tags: ['workstation', 'amd', 'rendering', 'ai'] },
    { title: 'Sennheiser HD 800 S Reference', cat: 9, price: 1799.95, cost: 1100.00, tags: ['audio', 'audiophile', 'open-back'] },
    { title: 'Focal Clear Mg Professional', cat: 9, price: 1499.00, cost: 920.00, tags: ['audio', 'studio', 'magnesium'] },
    { title: 'Genelec 8351B SAM Studio Monitor', cat: 10, price: 4390.00, cost: 3100.00, tags: ['speakers', 'dsp', 'coaxial', 'reference'] },
    { title: 'Keychron Q1 Pro Custom QMK/VIA', cat: 11, price: 199.00, cost: 95.00, tags: ['keyboard', 'mechanical', 'aluminum', 'wireless'] },
    { title: 'Herman Miller Embody Gaming Chair', cat: 12, price: 1695.00, cost: 950.00, tags: ['chair', 'ergonomic', 'posture'] },
    { title: 'BenQ ScreenBar Pro Monitor Light', cat: 13, price: 139.00, cost: 60.00, tags: ['lighting', 'desk', 'auto-dimming'] },
    { title: 'OmniScreen 34" Curved QD-OLED 175Hz', cat: 1, price: 899.99, cost: 610.00, tags: ['monitor', 'ultrawide', 'oled', '175hz'] },
    { title: 'SoundStage Reference 8" Active Studio Monitor', cat: 10, price: 799.00, cost: 420.00, tags: ['speakers', 'studio', 'xlr'] },
    { title: 'PhotonStream 4K60 HDR Streaming Webcam', cat: 1, price: 179.00, cost: 80.00, tags: ['webcam', '4k', 'hdr', 'autofocus'] },
    { title: 'PulseVR Pro Spatial Computing Headset', cat: 4, price: 1199.00, cost: 790.00, tags: ['vr', 'spatial-audio', 'eye-tracking'] },
    { title: 'FluxGrip Ultra-Lightweight Wireless Mouse 49g', cat: 4, price: 129.00, cost: 52.00, tags: ['mouse', '4k-polling', 'optical'] }
  ];

  const prodStmt = db.prepare(`
    INSERT INTO products (sku, category_id, title, description, price, cost_price, stock_quantity, is_published, rating, reviews_count, tags_json, dimensions_json, thumbnail_blob, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
  `);

  const productIds = [];
  let skuCounter = 1000;

  for (let i = 0; i < 100; i++) {
    const base = productBases[i % productBases.length];
    skuCounter++;
    const sku = `SKU-${skuCounter}-${String.fromCharCode(65 + (i % 26))}`;
    const variantSuffix = i >= productBases.length ? ` Edition v${Math.floor(i / productBases.length) + 1}` : '';
    const title = `${base.title}${variantSuffix}`;
    const price = randomFloat(base.price * 0.85, base.price * 1.2);
    const cost = parseFloat((price * 0.62).toFixed(2));
    const stock = randomInt(5, 250);
    const isPub = 1;
    const rating = randomFloat(3.9, 5.0, 1);
    const revCount = randomInt(5, 180);

    const dims = JSON.stringify({
      weight_kg: randomFloat(0.2, 18.0),
      width_cm: randomFloat(8.0, 120.0),
      height_cm: randomFloat(2.0, 85.0),
      depth_cm: randomFloat(5.0, 60.0),
      warranty_months: randomChoice([12, 24, 36, 60])
    });

    const thumbnail = createColoredPng(randomInt(40, 200), randomInt(40, 200), randomInt(40, 200));

    prodStmt.run([
      sku,
      base.cat,
      title,
      `Engineered for demanding production environments and creative excellence. Premium high-grade alloy components.`,
      price,
      cost,
      stock,
      isPub,
      rating,
      revCount,
      JSON.stringify(base.tags),
      dims,
      thumbnail,
      `2025-0${randomInt(1, 9)}-${randomInt(10, 28)} 08:30:00`
    ]);
    productIds.push(i + 1);
  }
  prodStmt.free();
  console.log(`Inserted 100 products.`);

  // 6. Insert Orders & Order Items (1,500 Orders & 4,500+ Order Items)
  const orderStmt = db.prepare(`
    INSERT INTO orders (order_number, customer_id, assigned_agent_id, status, subtotal, tax_amount, shipping_fee, discount_amount, total_amount, payment_method, payment_status, shipping_address_json, notes, created_at, shipped_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
  `);

  const orderItemStmt = db.prepare(`
    INSERT INTO order_items (order_id, product_id, quantity, unit_price, discount_pct, total_price)
    VALUES (?, ?, ?, ?, ?, ?);
  `);

  const orderStatuses = ['delivered', 'delivered', 'delivered', 'shipped', 'processing', 'pending', 'cancelled'];
  const paymentMethods = ['credit_card', 'credit_card', 'paypal', 'apple_pay', 'invoice', 'crypto'];

  console.log('Inserting 1,500 realistic orders and ~4,500 order items...');
  let totalOrderItemsCount = 0;

  for (let o = 1; o <= 1500; o++) {
    const orderNum = `ORD-2026-${(10000 + o).toString()}`;
    const custId = randomChoice(customerIds);
    const agentId = randomChoice(userIds);
    const status = randomChoice(orderStatuses);
    const paymentMethod = randomChoice(paymentMethods);
    const paymentStatus = (status === 'delivered' || status === 'shipped') ? 'paid' : (status === 'cancelled' ? 'refunded' : randomChoice(['paid', 'unpaid']));

    // 1-5 line items per order
    const numItems = randomInt(1, 5);
    let subtotal = 0;
    const lineItems = [];

    for (let li = 0; li < numItems; li++) {
      const prodId = randomChoice(productIds);
      const qty = randomInt(1, 4);
      const unitPrice = randomFloat(79.0, 1499.0);
      const discount = Math.random() > 0.75 ? randomChoice([5.0, 10.0, 15.0]) : 0.0;
      const lineTotal = parseFloat((qty * unitPrice * (1 - discount / 100)).toFixed(2));
      subtotal += lineTotal;
      lineItems.push({ prodId, qty, unitPrice, discount, lineTotal });
    }

    subtotal = parseFloat(subtotal.toFixed(2));
    const tax = parseFloat((subtotal * 0.0825).toFixed(2));
    const shipping = subtotal > 300 ? 0.0 : 18.5;
    const discountAmount = Math.random() > 0.8 ? randomFloat(20.0, 100.0) : 0.0;
    const total = parseFloat((subtotal + tax + shipping - discountAmount).toFixed(2));

    const shipAddress = JSON.stringify({
      recipient: `Customer Account #${custId}`,
      carrier: randomChoice(['FedEx Priority', 'UPS Worldwide', 'DHL Express Air', 'USPS Express']),
      tracking_number: `TRK-${randomInt(100000000, 999999999)}`,
      estimated_delivery_days: randomInt(1, 4)
    });

    const notes = Math.random() > 0.7 ? randomChoice([
      'Deliver to Dock 4, Security check required.',
      'Leave with building reception if closed.',
      'Fragile optical test gear. Do not tilt.',
      'Priority delivery for production deployment.'
    ]) : null;

    // Distribute orders across last 12 months with realistic seasonal growth
    const month = randomInt(1, 12).toString().padStart(2, '0');
    const day = randomInt(1, 28).toString().padStart(2, '0');
    const hour = randomInt(8, 22).toString().padStart(2, '0');
    const minute = randomInt(10, 59).toString().padStart(2, '0');
    const year = month <= '03' ? '2026' : '2025';
    const createdAt = `${year}-${month}-${day} ${hour}:${minute}:00`;
    const shippedAt = (status === 'shipped' || status === 'delivered') ? `${year}-${month}-${day} 23:45:00` : null;

    orderStmt.run([
      orderNum,
      custId,
      agentId,
      status,
      subtotal,
      tax,
      shipping,
      discountAmount,
      total,
      paymentMethod,
      paymentStatus,
      shipAddress,
      notes,
      createdAt,
      shippedAt
    ]);

    for (const item of lineItems) {
      orderItemStmt.run([o, item.prodId, item.qty, item.unitPrice, item.discount, item.lineTotal]);
      totalOrderItemsCount++;
    }
  }

  orderStmt.free();
  orderItemStmt.free();
  console.log(`Inserted 1,500 orders and ${totalOrderItemsCount} order items.`);

  // 7. Insert Daily Sales Metrics (365 days of rich data for beautiful charts)
  console.log('Generating 365 daily sales metrics for charts & visualizer...');
  const dailyStmt = db.prepare(`
    INSERT INTO daily_sales_metrics (report_date, total_revenue, orders_count, average_order_value, new_customers, discount_total, refund_amount, traffic_visits, conversion_rate_pct)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);
  `);

  const baseDate = new Date('2025-03-01');
  for (let d = 0; d < 365; d++) {
    const curDate = new Date(baseDate);
    curDate.setDate(baseDate.getDate() + d);
    const dateStr = curDate.toISOString().split('T')[0];

    // Seasonal curve (higher in Q4) + weekday bump
    const dayOfWeek = curDate.getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    const weekendMultiplier = isWeekend ? 0.75 : 1.25;
    const month = curDate.getMonth();
    const seasonMultiplier = (month === 10 || month === 11) ? 1.6 : 1.0; // Black Friday / Holidays

    const ordersCount = Math.floor(randomInt(25, 75) * weekendMultiplier * seasonMultiplier);
    const avgOrderVal = randomFloat(180.0, 480.0);
    const totalRev = parseFloat((ordersCount * avgOrderVal).toFixed(2));
    const newCust = randomInt(4, 22);
    const discount = parseFloat((totalRev * randomFloat(0.02, 0.08)).toFixed(2));
    const refund = parseFloat((totalRev * randomFloat(0.005, 0.03)).toFixed(2));
    const visits = randomInt(1800, 6500) * (isWeekend ? 1 : 2);
    const convRate = parseFloat(((ordersCount / visits) * 100).toFixed(2));

    dailyStmt.run([
      dateStr,
      totalRev,
      ordersCount,
      avgOrderVal,
      newCust,
      discount,
      refund,
      visits,
      convRate
    ]);
  }
  dailyStmt.free();
  console.log('Inserted 365 daily sales metrics records.');

  // 8. Insert Server Performance Logs (5,000 log events for heavy stress testing)
  console.log('Inserting 5,000 server performance logs for heavy data stress-testing...');
  const perfStmt = db.prepare(`
    INSERT INTO server_performance_logs (timestamp, server_node, region, cpu_usage_pct, memory_usage_pct, latency_ms, requests_per_sec, error_count)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?);
  `);

  const servers = ['prod-app-01', 'prod-app-02', 'prod-app-03', 'prod-db-primary', 'prod-cache-01', 'prod-gateway-01'];
  const regions = ['us-east-1', 'us-west-2', 'eu-central-1', 'ap-northeast-1'];

  for (let s = 1; s <= 5000; s++) {
    const srv = randomChoice(servers);
    const reg = randomChoice(regions);
    const cpu = randomFloat(18.5, 94.2, 1);
    const mem = randomFloat(35.0, 89.0, 1);
    const lat = randomFloat(1.2, 45.8, 1);
    const rps = randomInt(120, 3400);
    const errs = cpu > 85 ? randomInt(5, 45) : randomInt(0, 3);
    const logDate = new Date(Date.now() - (5000 - s) * 60 * 1000).toISOString().replace('T', ' ').substring(0, 19);

    perfStmt.run([
      logDate,
      srv,
      reg,
      cpu,
      mem,
      lat,
      rps,
      errs
    ]);
  }
  perfStmt.free();
  console.log('Inserted 5,000 server performance logs.');

  // 9. Insert Reviews (400 reviews with ratings, helpful votes, comments)
  const reviewTitles = [
    'Exceeded all our production expectations!',
    'Solid build quality, premium CNC milled materials',
    'Good overall, minor driver setup quirks on Linux',
    'Best in class, would deploy across fleet again',
    'Incredible acoustic clarity and isolation',
    'Typing experience is buttery smooth and responsive',
    'Ultra-low latency connection, rock solid build',
    'High dynamic range and phenomenal color accuracy',
    'Essential equipment for our design and ML engineering teams'
  ];

  const reviewStmt = db.prepare(`
    INSERT INTO reviews (product_id, user_id, rating, title, comment, is_verified_purchase, helpful_votes, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?);
  `);

  for (let r = 1; r <= 400; r++) {
    const prodId = randomChoice(productIds);
    const userId = randomChoice(userIds);
    const rating = randomChoice([5, 5, 5, 4, 4, 5, 3, 4, 2]);
    const title = randomChoice(reviewTitles);
    const comment = `We have been testing this in our laboratory environment daily. High reliability, superb thermals, and immediate interoperability.`;
    const verified = Math.random() > 0.1 ? 1 : 0;
    const votes = randomInt(0, 68);
    const date = `2026-0${randomInt(1, 3)}-${randomInt(1, 28).toString().padStart(2, '0')} ${randomInt(10, 21)}:00:00`;

    reviewStmt.run([prodId, userId, rating, title, comment, verified, votes, date]);
  }
  reviewStmt.free();
  console.log(`Inserted 400 reviews.`);

  // 10. Insert Audit Logs (500 audit event entries)
  const auditActions = ['USER_LOGIN', 'USER_ROLE_UPDATED', 'ORDER_CREATED', 'PAYMENT_CAPTURED', 'PRODUCT_PRICE_UPDATED', 'STOCK_ADJUSTED', 'SETTINGS_CHANGED', 'DATABASE_BACKUP_COMPLETED'];
  const auditStmt = db.prepare(`
    INSERT INTO audit_logs (action, entity_type, entity_id, actor_id, ip_address, user_agent, changes_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?);
  `);

  for (let a = 1; a <= 500; a++) {
    const action = randomChoice(auditActions);
    const entityType = action.split('_')[0].toLowerCase();
    const entityId = randomInt(1, 100);
    const actorId = randomChoice(userIds);
    const ip = `10.240.${randomInt(1, 20)}.${randomInt(10, 250)}`;
    const ua = randomChoice([
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0',
      'VSCode/1.90.0 (Darwin; arm64) OmniCommerce-CLI/2.4.0'
    ]);

    const changes = JSON.stringify({
      previous_state: { status: 'pending', value: randomInt(10, 50) },
      new_state: { status: 'approved', value: randomInt(60, 100) },
      triggered_by: 'automated_rule'
    });

    const time = `2026-03-0${randomInt(1, 6)} ${randomInt(10, 22)}:${randomInt(10, 59)}:00`;
    auditStmt.run([action, entityType, entityId, actorId, ip, ua, changes, time]);
  }
  auditStmt.free();
  console.log(`Inserted 500 audit logs.`);

  // 11. Insert System Configuration (Key-Value)
  const settings = [
    ['app.name', JSON.stringify('OmniCommerce Platform'), 'general', 1],
    ['app.version', JSON.stringify('2.5.0-enterprise'), 'general', 1],
    ['auth.mfa_enforced', JSON.stringify(true), 'security', 0],
    ['auth.session_timeout_seconds', JSON.stringify(86400), 'security', 0],
    ['billing.currency', JSON.stringify('USD'), 'finance', 1],
    ['billing.tax_rate_default', JSON.stringify(0.0825), 'finance', 0],
    ['ai.model_provider', JSON.stringify('gemini-2.0-flash'), 'ai', 0],
    ['ai.semantic_search_enabled', JSON.stringify(true), 'ai', 1],
    ['storage.s3_bucket', JSON.stringify('prod-enterprise-assets-us-west-2'), 'storage', 0],
    ['cache.redis_ttl_minutes', JSON.stringify(60), 'infra', 0]
  ];

  const setStmt = db.prepare(`INSERT INTO system_settings (key, value_json, category, is_public) VALUES (?, ?, ?, ?);`);
  settings.forEach(s => setStmt.run(s));
  setStmt.free();
  console.log(`Inserted system configuration records.`);

  // Export and write to disk
  const data = db.export();
  const dbPath = path.join(__dirname, '../sample.db');
  fs.writeFileSync(dbPath, Buffer.from(data));

  const stats = fs.statSync(dbPath);
  console.log(`\n🎉 Successfully generated enriched & heavy sample.db!`);
  console.log(`File path: ${dbPath}`);
  console.log(`File size: ${(stats.size / (1024 * 1024)).toFixed(2)} MB (${stats.size.toLocaleString()} bytes)`);
}

createEnrichedDb().catch(err => {
  console.error('Failed to create sample db:', err);
  process.exit(1);
});
