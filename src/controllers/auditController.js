const db = require('../config/db');
const fs = require('fs');
const { analyze: staticAnalyze } = require('../services/staticAnalyzer');
const { analyzeWithAI } = require('../services/aiService');
const { generatePDF } = require('../services/pdfService');
const { generateHash, storeOnChain } = require('../services/blockchainService');

const TIER_LIMITS = {
    free: { maxLines: 300, maxAudits: 4, name: 'Free' },
    starter: { maxLines: 1000, maxAudits: 10, name: 'Starter' },
    pro: { maxLines: 5000, maxAudits: 50, name: 'Pro' },
    enterprise: { maxLines: 100000, maxAudits: 999999, name: 'Enterprise' }
};

const createAudit = async (req, res) => {
    try {
        let sourceCode = req.body.source_code;
        let contractName = req.body.contract_name || 'UnknownContract.sol';
        let compilerVersion = req.body.compiler_version || '0.8.19';
        let fileSize = 0;

        if (req.file) {
            sourceCode = fs.readFileSync(req.file.path, 'utf8');
            contractName = req.file.originalname;
            fileSize = req.file.size;
        }

        if (!sourceCode) {
            return res.status(400).json({ error: 'Source code is required' });
        }

        const linesOfCode = sourceCode.split('\n').length;
        const userTier = req.user.tier || 'free';
        const limits = TIER_LIMITS[userTier];

        // Validate line limit
        if (linesOfCode > limits.maxLines) {
            if (req.file) fs.unlinkSync(req.file.path);
            return res.status(400).json({ 
                error: `File exceeds line limit for ${limits.name} tier. Maximum: ${limits.maxLines} lines, Your file: ${linesOfCode} lines.`,
                current_limit: limits.maxLines,
                your_file_lines: linesOfCode,
                upgrade_suggestion: userTier === 'free' ? 'Upgrade to Starter for 1,000 lines limit' :
                                   userTier === 'starter' ? 'Upgrade to Pro for 5,000 lines limit' :
                                   userTier === 'pro' ? 'Upgrade to Enterprise for unlimited lines' : null
            });
        }

        // Check monthly audit limit
        const currentMonth = new Date().toISOString().slice(0, 7);
        
        db.get(`SELECT COUNT(*) as audit_count FROM audits WHERE user_id = ? AND created_at LIKE ?`, 
            [req.user.id, currentMonth + '%'], 
            async (err, result) => {
                if (err) {
                    console.error('Error checking audit count:', err);
                    if (req.file) fs.unlinkSync(req.file.path);
                    return res.status(500).json({ error: 'Database error' });
                }

                if (result.audit_count >= limits.maxAudits) {
                    if (req.file) fs.unlinkSync(req.file.path);
                    return res.status(400).json({ 
                        error: `Monthly audit limit reached for ${limits.name} tier. Maximum: ${limits.maxAudits} audits/month.`,
                        current_usage: result.audit_count,
                        limit: limits.maxAudits,
                        upgrade_suggestion: userTier === 'free' ? 'Upgrade to Starter for 10 audits/month' :
                                           userTier === 'starter' ? 'Upgrade to Pro for 50 audits/month' : null
                    });
                }

                // Continue with audit
                const staticFindings = staticAnalyze(sourceCode);

                db.run(
                    'INSERT INTO audits (user_id, contract_name, source_code, lines_of_code, compiler_version, status) VALUES (?, ?, ?, ?, ?, \'processing\')',
                    [req.user.id, contractName, sourceCode, linesOfCode, compilerVersion],
                    async function(err) {
                        if (err) {
                            if (req.file) fs.unlinkSync(req.file.path);
                            return res.status(500).json({ error: 'Database error' });
                        }

                        const auditId = this.lastID;
                        const stmt = db.prepare('INSERT INTO findings (audit_id, title, severity, category, description, affected_lines, code_snippet, remediation, confidence_score, swc_id, ai_generated) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
                        
                        for (const finding of staticFindings) {
                            stmt.run(
                                auditId, finding.title, finding.severity, finding.category, finding.description,
                                JSON.stringify(finding.affected_lines), finding.code_snippet, finding.remediation,
                                finding.confidence_score, finding.swc_id, 0
                            );
                        }
                        stmt.finalize();

                        let aiResult = null;
                        try {
                            aiResult = await analyzeWithAI(sourceCode, staticFindings);
                        } catch (aiError) {
                            console.error('AI Analysis failed, falling back to static only:', aiError.message);
                        }

                        let riskScore = 100;
                        let finalFindingsCount = staticFindings.length;

                        if (aiResult && aiResult.findings && aiResult.findings.length > 0) {
                            const aiStmt = db.prepare('INSERT INTO findings (audit_id, title, severity, category, description, affected_lines, code_snippet, remediation, confidence_score, swc_id, ai_generated) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
                            for (const finding of aiResult.findings) {
                                aiStmt.run(
                                    auditId, finding.title, finding.severity, finding.category, finding.description,
                                    JSON.stringify(finding.affected_lines || []), finding.code_snippet || '', finding.remediation || '',
                                    finding.confidence_score || 80, finding.swc_id || 'AI-000', 1
                                );
                                finalFindingsCount++;
                            }
                            aiStmt.finalize();
                            riskScore = aiResult.overall_risk_score !== undefined ? aiResult.overall_risk_score : riskScore;
                        } else {
                            staticFindings.forEach(f => {
                                if (f.severity === 'critical') riskScore -= 30;
                                else if (f.severity === 'high') riskScore -= 20;
                                else if (f.severity === 'medium') riskScore -= 10;
                                else if (f.severity === 'low') riskScore -= 5;
                            });
                            riskScore = Math.max(0, riskScore);
                        }

                        db.run(
                            'UPDATE audits SET status = \'completed\', overall_risk_score = ? WHERE id = ?',
                            [riskScore, auditId],
                            (err) => {
                                if (req.file) fs.unlinkSync(req.file.path);
                                
                                res.status(201).json({
                                    audit_id: auditId,
                                    contract_name: contractName,
                                    lines_of_code: linesOfCode,
                                    file_size: fileSize,
                                    status: 'completed',
                                    findings_count: finalFindingsCount,
                                    ai_enhanced: !!aiResult,
                                    tier_limit: {
                                        max_lines: limits.maxLines,
                                        max_audits_per_month: limits.maxAudits,
                                        audits_used_this_month: result.audit_count + 1
                                    },
                                    message: aiResult ? 'AI and Static analysis completed.' : 'Static analysis completed (AI fallback).'
                                });
                            }
                        );
                    }
                );
            }
        );
    } catch (error) {
        if (req.file) fs.unlinkSync(req.file.path);
        console.error('Audit creation error:', error);
        res.status(500).json({ error: 'Server error' });
    }
};

const getAudit = (req, res) => {
    const auditId = req.params.id;
    db.get('SELECT id, contract_name, lines_of_code, compiler_version, overall_risk_score, status, created_at FROM audits WHERE id = ? AND user_id = ?', [auditId, req.user.id], (err, audit) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        if (!audit) return res.status(404).json({ error: 'Audit not found' });
        res.json({ audit });
    });
};

const getFindings = (req, res) => {
    const auditId = req.params.id;
    db.all('SELECT id, title, severity, category, description, affected_lines, code_snippet, remediation, confidence_score, swc_id, ai_generated FROM findings WHERE audit_id = ?', [auditId], (err, findings) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        const parsedFindings = findings.map(f => ({
            ...f,
            affected_lines: JSON.parse(f.affected_lines || '[]')
        }));
        res.json({ findings: parsedFindings });
    });
};

const exportReport = async (req, res) => {
    const auditId = req.params.id;
    db.get('SELECT * FROM audits WHERE id = ? AND user_id = ?', [auditId, req.user.id], async (err, audit) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        if (!audit) return res.status(404).json({ error: 'Audit not found' });
        
        db.all('SELECT * FROM findings WHERE audit_id = ?', [auditId], async (err, findings) => {
            if (err) return res.status(500).json({ error: 'Database error' });
            
            const parsedFindings = findings.map(f => ({
                ...f,
                affected_lines: JSON.parse(f.affected_lines || '[]')
            }));
            
            try {
                const pdfPath = await generatePDF(audit, parsedFindings);
                const reportData = { audit, findings: parsedFindings };
                const hash = generateHash(reportData);
                const chainData = await storeOnChain(hash);
                
                db.run('UPDATE audits SET report_path = ?, blockchain_tx_hash = ?, blockchain_network = ? WHERE id = ?', 
                    [pdfPath, chainData.txHash, chainData.network, auditId], (err) => {
                        if (err) return res.status(500).json({ error: 'Database update error' });
                        
                        db.run('INSERT INTO blockchain_records (audit_id, network, tx_hash, hash_stored, verified) VALUES (?, ?, ?, ?, ?)',
                            [auditId, chainData.network, chainData.txHash, hash, 1]);
                            
                        res.json({
                            download_url: `/reports/audit-${auditId}.pdf`,
                            blockchain_tx_hash: chainData.txHash,
                            network: chainData.network,
                            hash: hash
                        });
                    }
                );
            } catch (error) {
                console.error('PDF generation failed:', error);
                res.status(500).json({ error: 'PDF generation failed' });
            }
        });
    });
};

const getUsageStats = (req, res) => {
    const userId = req.user.id;
    const tier = req.user.tier || 'free';
    const limits = TIER_LIMITS[tier];
    
    const currentMonth = new Date().toISOString().slice(0, 7);
    
    db.get(`SELECT COUNT(*) as audit_count, COALESCE(SUM(lines_of_code), 0) as total_lines 
            FROM audits 
            WHERE user_id = ? AND created_at LIKE ?`, 
        [userId, currentMonth + '%'], 
        (err, usage) => {
            if (err) return res.status(500).json({ error: 'Database error' });
            
            res.json({
                tier: tier,
                tier_name: limits.name,
                limits: {
                    max_lines_per_audit: limits.maxLines,
                    max_audits_per_month: limits.maxAudits
                },
                usage: {
                    audits_this_month: usage.audit_count,
                    lines_scanned_this_month: usage.total_lines,
                    audits_remaining: Math.max(0, limits.maxAudits - usage.audit_count)
                }
            });
        }
    );
};

module.exports = { createAudit, getAudit, getFindings, exportReport, getUsageStats };
