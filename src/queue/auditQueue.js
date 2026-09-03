// src/queue/auditQueue.js
const PQueue = require('p-queue');

// Concurrency: 1 artinya hanya 1 audit yang diproses sekaligus.
// Ini menjamin RAM dan CPU tidak akan pernah overload (Anti-Down).
const queue = new PQueue({ concurrency: 1 });

// Monitor antrian (Opsional, untuk logging)
queue.on('active', () => {
    console.log(`[QUEUE] Memproses audit. Sisa antrian: ${queue.size}`);
});

module.exports = queue;
