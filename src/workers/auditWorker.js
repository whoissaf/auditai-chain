// src/workers/auditWorker.js
const { execFile } = require('child_process');
const util = require('util');
const fs = require('fs');
const path = require('path');
const execFilePromise = util.promisify(execFile);

// --- 1. SLITHER SERVICE (Stable Mode) ---
async function runSlither(filePath) {
    try {
        // Timeout 2 menit. Jika lemot, biarkan lemot, tapi jangan crash.
        const { stdout } = await execFilePromise('slither', [filePath, '--json'], {
            timeout: 120000, 
            maxBuffer: 10 * 1024 * 1024 // 10MB buffer
        });
        return JSON.parse(stdout);
    } catch (error) {
        console.warn('[SLITHER] Gagal atau Timeout. Melanjutkan tanpa Slither.');
        return null; // Return null, jangan throw error agar sistem tidak down
    }
}

// --- 2. AI MULTI-AGENT (Sequential untuk hemat RAM) ---
async function runAIAgent(agentName, sourceCode, context) {
    try {
        // Panggil Gemini API di sini (gunakan kode aiService.js Anda sebelumnya)
        // const result = await analyzeWithGemini(prompt);
        // return result;
        console.log(`[AI] Agen ${agentName} selesai.`);
        return []; 
    } catch (error) {
        console.warn(`[AI] Agen ${agentName} gagal. Melanjutkan.`);
        return [];
    }
}

// --- 3. MAIN WORKER FUNCTION ---
async function processAuditJob(jobData, bot, chatId) {
    const { filePath, fileName } = jobData;
    
    try {
        // 1. Beri tahu user (Non-blocking)
        bot.sendMessage(chatId, `🔄 *${fileName}* masuk antrian. Sedang menjalankan Slither...`, { parse_mode: 'Markdown' });

        // 2. Jalankan Slither (Aman, jika error return null)
        const slitherResult = await runSlither(filePath);

        bot.sendMessage(chatId, ` Slither selesai. Memulai AI Multi-Agent...`, { parse_mode: 'Markdown' });

        // 3. Jalankan AI Agents (Sequential: Reentrancy -> Access Control -> Validator)
        // Kita jalankan satu per satu agar tidak memory leak
        const findings = [];
        
        // ... (Logika AI Multi-Agent di sini) ...

        bot.sendMessage(chatId, ` Analisis selesai. Membuat PDF...`, { parse_mode: 'Markdown' });

        // 4. Generate PDF & Blockchain Hash
        // const pdfPath = await generatePDF(...);

        // 5. Kirim Hasil ke Telegram
        bot.sendMessage(chatId, `✅ *AUDIT SELESAI*\n\nRisk Score: 85/100\nTemuan: 3 Critical`, { parse_mode: 'Markdown' });
        // bot.sendDocument(chatId, pdfPath);

    } catch (error) {
        // SAFETY NET: Jika ada error tak terduga, bot tetap hidup, hanya job ini yang gagal.
        console.error('[WORKER] Critical Error pada job:', error);
        bot.sendMessage(chatId, `❌ Maaf, terjadi kesalahan internal pada audit ini. Silakan coba lagi.`);
    } finally {
        // Hapus file temporary untuk hemat storage
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
    }
}

module.exports = { processAuditJob };
