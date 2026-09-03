// src/bot.js
const TelegramBot = require('node-telegram-bot-api');
const queue = require('./queue/auditQueue');
const { processAuditJob } = require('./workers/auditWorker');
const fs = require('fs');
const path = require('path');

const token = 'YOUR_TELEGRAM_BOT_TOKEN';
const bot = new TelegramBot(token, { polling: true });

const TEMP_DIR = path.join(__dirname, '../data/temp');
if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });

bot.onText(/\/start/, (msg) => {
    bot.sendMessage(msg.chat.id, "Halo! Kirim file .sol Anda untuk diaudit.");
});

bot.on('document', async (msg) => {
    const chatId = msg.chat.id;
    const file = msg.document;

    // Validasi sederhana
    if (!file.file_name.endsWith('.sol')) {
        return bot.sendMessage(chatId, "❌ Hanya file .sol yang diterima.");
    }

    try {
        // 1. Download file dari Telegram
        const fileId = file.file_id;
        const filePath = path.join(TEMP_DIR, `${Date.now()}_${file.file_name}`);
        const fileStream = bot.getFileStream(fileId);
        const writeStream = fs.createWriteStream(filePath);
        
        fileStream.pipe(writeStream);

        writeStream.on('finish', async () => {
            // 2. Masukkan ke Antrian (Queue)
            // Bot langsung bebas, tidak menunggu proses selesai
            queue.add(() => processAuditJob({ filePath, fileName: file.file_name }, bot, chatId));
            
            bot.sendMessage(chatId, `📥 File *${file.file_name}* diterima. Posisi antrian: ${queue.size + 1}`, { parse_mode: 'Markdown' });
        });

    } catch (error) {
        console.error('[BOT] Error menerima file:', error);
        bot.sendMessage(chatId, "❌ Gagal menerima file.");
    }
});

console.log('[BOT] Telegram Bot berjalan dan siap menerima antrian...');
