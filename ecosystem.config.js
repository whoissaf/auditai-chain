module.exports = {
  apps: [{
    name: 'auditai-telegram-bot',
    script: './src/bot.js',
    instances: 1, // PENTING: Harus 1 karena kita pakai in-memory queue
    exec_mode: 'fork',
    max_memory_restart: '500M', // Jika RAM > 500MB, restart otomatis (Anti-Crash)
    env: {
      NODE_ENV: 'production'
    }
  }]
};
