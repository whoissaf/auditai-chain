require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const { Octokit } = require('@octokit/rest');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const db = require('./src/config/db');

// === INIT ===
const token = process.env.TELEGRAM_BOT_TOKEN;
const bot = new TelegramBot(token, { polling: true });

const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
const GITHUB_OWNER = process.env.GITHUB_REPO_OWNER;
const GITHUB_REPO = process.env.GITHUB_REPO_NAME;
const GITHUB_BRANCH = process.env.GITHUB_BRANCH;

const TEMP_DIR = path.join(__dirname, 'data', 'temp', 'telegram');
if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });

// === HELPER: Get or Create User ===
async function getOrCreateUser(chatId, username) {
    return new Promise((resolve, reject) => {
        db.get('SELECT * FROM users WHERE telegram_chat_id = ?', [chatId], async (err, user) => {
            if (err) return reject(err);
            if (user) return resolve(user);
            
            // Create new user with default 'free' tier
            const email = `${username || chatId}@telegram.user`;
            const passwordHash = crypto.randomBytes(32).toString('hex');
            
            db.run(
                'INSERT INTO users (email, password_hash, telegram_chat_id, tier) VALUES (?, ?, ?, ?)',
                [email, passwordHash, chatId, 'free'],
                function(err) {
                    if (err) return reject(err);
                    db.get('SELECT * FROM users WHERE id = ?', [this.lastID], (err, newUser) => {
                        if (err) return reject(err);
                        resolve(newUser);
                    });
                }
            );
        });
    });
}

// === HELPER: Check Tier Limits ===
function getTierLimits(tier) {
    const limits = {
        free: { maxFiles: 1, maxLines: 300, maxAudits: 4, echidna: false, mythril: true },
        starter: { maxFiles: 5, maxLines: 1000, maxAudits: 10, echidna: false, mythril: true },
        pro: { maxFiles: 20, maxLines: 5000, maxAudits: 50, echidna: true, mythril: true },
        enterprise: { maxFiles: 100, maxLines: 100000, maxAudits: 999999, echidna: true, mythril: true }
    };
    return limits[tier] || limits.free;
}

// === COMMAND: /start ===
bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    const username = msg.from.username;
    
    try {
        const user = await getOrCreateUser(chatId, username);
        const limits = getTierLimits(user.tier);
        
        const welcomeMsg = `
🛡️ *Selamat datang di AuditAI Chain!*

Saya adalah bot auditor smart contract otomatis yang menggunakan:
• *Slither* - Static Analysis (100+ detectors)
• *Mythril* - Symbolic Execution
• *Echidna* - Fuzzing (tier Pro+)
• *AI Multi-Agent* - 4 spesialis + validator

📊 *Paket Anda:* ${user.tier.toUpperCase()}
• Max ${limits.maxFiles} file per audit
• Max ${limits.maxLines.toLocaleString()} baris kode
• Max ${limits.maxAudits} audit/bulan
• Echidna Fuzzing: ${limits.echidna ? '✅' : '❌'}

📤 *Cara menggunakan:*
Kirim file *.sol* atau *.zip* untuk memulai audit.

Ketik /help untuk bantuan lebih lanjut.
        `;
        
        bot.sendMessage(chatId, welcomeMsg, { parse_mode: 'Markdown' });
    } catch (err) {
        console.error('Start command error:', err);
        bot.sendMessage(chatId, '❌ Terjadi kesalahan saat inisialisasi.');
    }
});

// === COMMAND: /help ===
bot.onText(/\/help/, (msg) => {
    const helpMsg = `
 *Bantuan AuditAI Chain*

/perintah yang tersedia:
/start - Mulai bot
/help - Tampilkan bantuan
/status - Cek status audit terakhir
/usage - Cek penggunaan bulan ini
/upgrade - Info upgrade paket
/reset - Reset sesi (clear file pending)

 *Cara audit:*
1. Kirim file .sol (single file)
2. Kirim file .zip (multi-file, max 5 file)
3. Tunggu 2-10 menit (tergantung kompleksitas)
4. Terima hasil + PDF report

⚠️ *Catatan:*
- File max 50KB
- Syntax harus valid Solidity
- Proses berjalan di GitHub Actions (7GB RAM)
        `;
    bot.sendMessage(msg.chat.id, helpMsg, { parse_mode: 'Markdown' });
});

// === COMMAND: /usage ===
bot.onText(/\/usage/, async (msg) => {
    const chatId = msg.chat.id;
    
    try {
        const user = await getOrCreateUser(chatId, msg.from.username);
        const limits = getTierLimits(user.tier);
        
        const currentMonth = new Date().toISOString().slice(0, 7);
        
        db.get(
            `SELECT COUNT(*) as audit_count, COALESCE(SUM(lines_of_code), 0) as total_lines 
             FROM audits WHERE user_id = ? AND created_at LIKE ?`,
            [user.id, currentMonth + '%'],
            (err, usage) => {
                if (err) {
                    bot.sendMessage(chatId, '❌ Gagal mengambil data penggunaan.');
                    return;
                }
                
                const msg = `
 *Penggunaan Bulan Ini*

Paket: *${user.tier.toUpperCase()}*

Audit: ${usage.audit_count} / ${limits.maxAudits}
Baris discan: ${usage.total_lines.toLocaleString()} / ${limits.maxLines.toLocaleString()}

Sisa audit: ${Math.max(0, limits.maxAudits - usage.audit_count)}
                `;
                bot.sendMessage(chatId, msg, { parse_mode: 'Markdown' });
            }
        );
    } catch (err) {
        bot.sendMessage(chatId, '❌ Terjadi kesalahan.');
    }
});

// === COMMAND: /upgrade ===
bot.onText(/\/upgrade/, (msg) => {
    const upgradeMsg = `
💳 *Paket Upgrade*

*Free* (Saat ini)
• 4 audit/bulan, 300 baris/audit
• Slither + Mythril + AI

*Starter* - $49/bulan
• 10 audit/bulan, 1000 baris/audit
• Semua fitur Free + Priority

*Pro* - $149/bulan
• 50 audit/bulan, 5000 baris/audit
• + Echidna Fuzzing
• + Multi-file (20 file)

*Enterprise* - Custom
• Unlimited
• Dedicated support

 Hubungi: admin@auditai.com untuk upgrade.
        `;
    bot.sendMessage(msg.chat.id, upgradeMsg, { parse_mode: 'Markdown' });
});

// === COMMAND: /status ===
bot.onText(/\/status/, async (msg) => {
    const chatId = msg.chat.id;
    
    try {
        const user = await getOrCreateUser(chatId, msg.from.username);
        
        db.get(
            'SELECT * FROM audits WHERE user_id = ? ORDER BY created_at DESC LIMIT 1',
            [user.id],
            (err, audit) => {
                if (err || !audit) {
                    bot.sendMessage(chatId, 'Belum ada audit.');
                    return;
                }
                
                const statusEmoji = {
                    'pending': '',
                    'processing': '',
                    'completed': '✅',
                    'failed': '❌'
                };
                
                const msg = `
📋 *Audit Terakhir*

ID: ${audit.id}
Kontrak: ${audit.contract_name}
Status: ${statusEmoji[audit.status] || '❓'} ${audit.status}
Baris: ${audit.lines_of_code}
Risk Score: ${audit.overall_risk_score || 'N/A'}/100
Tanggal: ${audit.created_at}
                `;
                bot.sendMessage(chatId, msg, { parse_mode: 'Markdown' });
            }
        );
    } catch (err) {
        bot.sendMessage(chatId, '❌ Terjadi kesalahan.');
    }
});

// === COMMAND: /reset ===
bot.onText(/\/reset/, (msg) => {
    delete pendingAudits[msg.chat.id];
    bot.sendMessage(msg.chat.id, '✅ Sesi direset. Kirim file baru untuk audit.');
});

// === STATE: Pending Audits ===
const pendingAudits = {};

// === HANDLE: Document (File Upload) ===
bot.on('document', async (msg) => {
    const chatId = msg.chat.id;
    const fileId = msg.document.file_id;
    const fileName = msg.document.file_name || 'unknown.sol';
    const fileSize = msg.document.file_size;
    
    // Validasi file
    if (!fileName.endsWith('.sol') && !fileName.endsWith('.zip')) {
        bot.sendMessage(chatId, '❌ Hanya file .sol atau .zip yang diterima.');
        return;
    }
    
    if (fileSize > 50 * 1024) {
        bot.sendMessage(chatId, '❌ File terlalu besar. Maksimal 50KB.');
        return;
    }
    
    try {
        // Get or create user
        const user = await getOrCreateUser(chatId, msg.from.username);
        const limits = getTierLimits(user.tier);
        
        // Check monthly limit
        const currentMonth = new Date().toISOString().slice(0, 7);
        const usageCheck = await new Promise((resolve, reject) => {
            db.get(
                `SELECT COUNT(*) as audit_count FROM audits WHERE user_id = ? AND created_at LIKE ?`,
                [user.id, currentMonth + '%'],
                (err, result) => {
                    if (err) return reject(err);
                    resolve(result);
                }
            );
        });
        
        if (usageCheck.audit_count >= limits.maxAudits) {
            bot.sendMessage(chatId, `❌ Batas audit bulan ini tercapai (${limits.maxAudits}). Upgrade paket untuk melanjutkan.`);
            return;
        }
        
        // Download file
        const fileStream = bot.getFileStream(fileId);
        const tempPath = path.join(TEMP_DIR, `${uuidv4()}_${fileName}`);
        const writeStream = fs.createWriteStream(tempPath);
        
        fileStream.pipe(writeStream);
        
        await new Promise((resolve, reject) => {
            writeStream.on('finish', resolve);
            writeStream.on('error', reject);
        });
        
        // Read file and count lines
        let sourceCode, filesCount = 1;
        
        if (fileName.endsWith('.zip')) {
            // Untuk ZIP, kita akan handle di GitHub Actions
            sourceCode = fs.readFileSync(tempPath).toString('base64');
            filesCount = 1; // ZIP dianggap 1 file untuk limit
        } else {
            sourceCode = fs.readFileSync(tempPath, 'utf8');
            const lines = sourceCode.split('\n').length;
            
            if (lines > limits.maxLines) {
                fs.unlinkSync(tempPath);
                bot.sendMessage(chatId, `❌ File ${lines} baris melebihi batas ${limits.maxLines} baris untuk paket ${user.tier}.`);
                return;
            }
        }
        
        // Create audit record
        const auditId = await new Promise((resolve, reject) => {
            db.run(
                `INSERT INTO audits (user_id, contract_name, source_code, lines_of_code, compiler_version, status, processing_stage, tools_used, analysis_version) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [user.id, fileName, sourceCode, fileName.endsWith('.zip') ? 0 : sourceCode.split('\n').length, '0.8.19', 'pending', 'queued', '', '2.0'],
                function(err) {
                    if (err) return reject(err);
                    resolve(this.lastID);
                }
            );
        });
        
        pendingAudits[chatId] = { auditId, tempPath, fileName, userId: user.id };
        
        // Notify user
        bot.sendMessage(chatId, ` File diterima: *${fileName}*

🔄 Memulai pipeline audit:
1️⃣ Slither (Static Analysis)
2️⃣ Mythril (Symbolic Execution)
3️⃣ ${limits.echidna ? 'Echidna (Fuzzing)' : 'Echidna (skip - tier Pro)'}
4️ AI Multi-Agent (4 spesialis + validator)
5️⃣ Cross-Validation & Merge
6️⃣ PDF Report + Blockchain Hash

⏱️ Estimasi: 2-10 menit

Saya akan mengirim hasil setelah selesai.`, { parse_mode: 'Markdown' });
        
        // Trigger GitHub Actions workflow
        await triggerGitHubWorkflow(auditId, fileName, user.tier, sourceCode);
        
        // Update status
        db.run('UPDATE audits SET status = ?, processing_stage = ? WHERE id = ?', 
            ['processing', 'triggered_github', auditId]);
        
    } catch (err) {
        console.error('Document handler error:', err);
        bot.sendMessage(chatId, '❌ Terjadi kesalahan saat memproses file.');
    }
});

// === TRIGGER: GitHub Actions Workflow ===
async function triggerGitHubWorkflow(auditId, fileName, tier, sourceCode) {
    try {
        const auditDir = `audits/${auditId}`;
        const filePath = `${auditDir}/${fileName}`;
        
        // Commit file to GitHub repo (this triggers the workflow)
        await octokit.repos.createOrUpdateFileContents({
            owner: GITHUB_OWNER,
            repo: GITHUB_REPO,
            path: filePath,
            message: `New audit #${auditId}: ${fileName}`,
            content: sourceCode,
            branch: GITHUB_BRANCH
        });
        
        // Trigger workflow with inputs
        await octokit.actions.createWorkflowDispatch({
            owner: GITHUB_OWNER,
            repo: GITHUB_REPO,
            workflow_id: 'audit.yml',
            ref: GITHUB_BRANCH,
            inputs: {
                audit_id: auditId.toString(),
                contract_name: fileName,
                tier: tier,
                backend_webhook_url: process.env.BACKEND_BASE_URL + '/api/webhook/github-audit',
                webhook_secret: process.env.WEBHOOK_SECRET
            }
        });
        
        console.log(`✅ Workflow triggered for audit #${auditId}`);
    } catch (err) {
        console.error('GitHub workflow trigger error:', err);
        throw err;
    }
}

// === WEBHOOK: Receive Results from GitHub Actions ===
// Endpoint ini dipanggil oleh GitHub Actions setelah audit selesai
// Lihat: src/routes/webhookRoutes.js

console.log('🤖 Telegram Bot started. Polling for updates...');
console.log(`📡 Bot Username: @${process.env.TELEGRAM_BOT_USERNAME || 'AuditAIChainBot'}`);

// Export untuk digunakan di webhook
module.exports = { bot, pendingAudits, TEMP_DIR };
