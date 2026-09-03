# 🛡️ AuditAI Chain

**AI-Powered Smart Contract Auditor as a Service**

AuditAI Chain adalah platform B2B SaaS yang menggabungkan *Static Analysis* dan *AI Semantic Analysis* untuk mendeteksi kerentanan pada smart contract Solidity dalam hitungan detik. Dirancang khusus untuk menjadi ringan, cepat, dan terjangkau, bahkan dapat berjalan optimal di lingkungan dengan sumber daya terbatas (seperti laptop 4GB RAM).

## ✨ Fitur Utama
- **Hybrid Analysis Engine:** Kombinasi Regex-based Static Analysis dan Google Gemini AI untuk akurasi tinggi dan false-positive rendah.
- **Automated PDF Reporting:** Generate laporan audit profesional siap pakai untuk investor atau tim pengembang.
- **Blockchain Audit Trail:** Hash laporan disimpan di blockchain (simulasi Sepolia/Polygon) untuk jaminan integritas dan anti-tamper.
- **Stripe Subscription:** Manajemen tier (Free, Starter, Pro) dengan webhook otomatis.
- **Resource Optimized:** Arsitektur backend Node.js + SQLite yang sangat efisien untuk deployment low-spec.

## 🛠️ Tech Stack
- **Runtime:** Node.js (Express.js)
- **Database:** SQLite 3 (File-based, zero config)
- **AI Engine:** Google Gemini 2.5 Flash API (Cloud-based, hemat RAM lokal)
- **Payment:** Stripe (Test Mode)
- **Security:** Helmet, CORS, JWT, bcrypt, express-rate-limit

## 🚀 Quick Start (Local Development)

1. **Clone & Install**
   ```bash
   git clone <repository-url>
   cd auditai-chain
   npm install
