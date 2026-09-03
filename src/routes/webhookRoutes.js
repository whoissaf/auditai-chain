const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const db = require('../config/db');

// POST /api/webhook/github-audit
router.post('/github-audit', (req, res) => {
    const signature = req.headers['x-webhook-signature'];
    const expectedSignature = crypto
        .createHmac('sha256', process.env.WEBHOOK_SECRET)
        .update(JSON.stringify(req.body))
        .digest('hex');
    
    if (signature !== expectedSignature) {
        console.error('❌ Invalid webhook signature');
        return res.status(401).json({ error: 'Invalid signature' });
    }
    
    const { audit_id, status, findings, overall_risk_score, tools_used, blockchain_hash, blockchain_tx_hash, error } = req.body;
    
    console.log(`📡 Webhook received for audit #${audit_id}: ${status}`);
    
    if (status === 'completed') {
        // Update audit record
        db.run(
            `UPDATE audits SET status = ?, overall_risk_score = ?, tools_used = ?, blockchain_hash = ?, blockchain_tx_hash = ?, processing_stage = 'completed' WHERE id = ?`,
            ['completed', overall_risk_score, JSON.stringify(tools_used), blockchain_hash, blockchain_tx_hash, audit_id],
            (err) => {
                if (err) {
                    console.error('❌ DB update error:', err);
                    return res.status(500).json({ error: 'DB error' });
                }
                
                // Save findings
                if (findings && findings.length > 0) {
                    const stmt = db.prepare(
                        `INSERT INTO findings (audit_id, title, severity, category, description, affected_lines, code_snippet, remediation, confidence_score, swc_id, ai_generated, source, exploit_scenario) 
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
                    );
                    
                    findings.forEach(f => {
                        stmt.run(
                            audit_id,
                            f.title,
                            f.severity,
                            f.category,
                            f.description,
                            JSON.stringify(f.affected_lines || []),
                            f.code_snippet || '',
                            f.remediation || '',
                            f.confidence || 80,
                            f.swc_id || 'N/A',
                            f.source === 'ai' ? 1 : 0,
                            f.source || 'unknown',
                            f.exploit_scenario || ''
                        );
                    });
                    stmt.finalize();
                }
                
                console.log(`✅ Audit #${audit_id} completed and saved`);
                res.json({ success: true });
            }
        );
    } else if (status === 'failed') {
        db.run(
            `UPDATE audits SET status = ?, processing_stage = 'failed' WHERE id = ?`,
            ['failed', audit_id],
            (err) => {
                if (err) console.error('❌ DB update error:', err);
                console.log(`❌ Audit #${audit_id} failed: ${error}`);
                res.json({ success: true });
            }
        );
    } else {
        res.json({ success: true });
    }
});

module.exports = router;
