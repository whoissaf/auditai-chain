require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const db = require('./src/config/db');
const authRoutes = require('./src/routes/authRoutes');
const auditRoutes = require('./src/routes/auditRoutes');
const billingRoutes = require('./src/routes/billingRoutes');
const webhookRoutes = require('./src/routes/webhookRoutes');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

const tempDir = path.join(__dirname, 'data', 'temp');
if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

const reportsDir = path.join(__dirname, 'data', 'reports');
if (!fs.existsSync(reportsDir)) fs.mkdirSync(reportsDir, { recursive: true });

app.use(helmet());
app.use(cors());

// Webhook needs raw body BEFORE express.json()
app.use('/api/webhook', express.json({ type: 'application/json' }));
app.use(express.json({ limit: '10mb' }));

app.use('/reports', express.static(reportsDir));
app.use(express.static(path.join(__dirname, 'public')));

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    message: { error: 'Too many requests, please try again later.' }
});

app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/audits', auditRoutes);
app.use('/api/billing', billingRoutes);
app.use('/api/webhook', webhookRoutes);

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    
    // Start Telegram Bot
    if (process.env.TELEGRAM_BOT_TOKEN) {
        require('./telegram-bot');
    } else {
        console.log('⚠️  TELEGRAM_BOT_TOKEN not set. Bot not started.');
    }
});
