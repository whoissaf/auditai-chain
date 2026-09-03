const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const dbPath = path.resolve(__dirname, '../../data/database.sqlite');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT,
        google_id TEXT,
        wallet_address TEXT,
        name TEXT,
        company TEXT,
        role TEXT DEFAULT 'user',
        tier TEXT DEFAULT 'free',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS subscriptions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        tier TEXT NOT NULL,
        stripe_customer_id TEXT,
        stripe_subscription_id TEXT,
        status TEXT DEFAULT 'active',
        current_period_start DATETIME,
        current_period_end DATETIME,
        audits_used_this_period INTEGER DEFAULT 0,
        lines_used_this_period INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS audits (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        contract_name TEXT,
        contract_address TEXT,
        source_code TEXT,
        lines_of_code INTEGER,
        compiler_version TEXT,
        overall_risk_score INTEGER,
        status TEXT DEFAULT 'pending',
        report_path TEXT,
        blockchain_tx_hash TEXT,
        blockchain_network TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        completed_at DATETIME,
        FOREIGN KEY (user_id) REFERENCES users(id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS findings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        audit_id INTEGER NOT NULL,
        title TEXT NOT NULL,
        severity TEXT NOT NULL,
        category TEXT,
        description TEXT,
        affected_lines TEXT,
        code_snippet TEXT,
        remediation TEXT,
        confidence_score INTEGER,
        swc_id TEXT,
        ai_generated BOOLEAN DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (audit_id) REFERENCES audits(id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS payments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        amount DECIMAL(10,2),
        currency TEXT DEFAULT 'USD',
        type TEXT,
        stripe_payment_intent_id TEXT,
        status TEXT DEFAULT 'pending',
        description TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS service_requests (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        audit_id INTEGER,
        urgency TEXT,
        budget_range TEXT,
        specific_concerns TEXT,
        quoted_price DECIMAL(10,2),
        status TEXT DEFAULT 'pending',
        assigned_auditor INTEGER,
        delivered_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id),
        FOREIGN KEY (audit_id) REFERENCES audits(id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS blockchain_records (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        audit_id INTEGER NOT NULL,
        network TEXT NOT NULL,
        tx_hash TEXT NOT NULL,
        block_number INTEGER,
        hash_stored TEXT NOT NULL,
        verified BOOLEAN DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (audit_id) REFERENCES audits(id)
    )`);
db.run(`CREATE TABLE IF NOT EXISTS tier_limits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tier TEXT UNIQUE NOT NULL,
    max_lines_per_audit INTEGER NOT NULL,
    max_audits_per_month INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)`);

db.run(`INSERT OR IGNORE INTO tier_limits (tier, max_lines_per_audit, max_audits_per_month) VALUES 
    ('free', 300, 4),
    ('starter', 1000, 10),
    ('pro', 5000, 50),
    ('enterprise', 100000, 999999)
`);

});



module.exports = db;
