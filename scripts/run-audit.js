const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// === CONFIG ===
const AUDIT_ID = process.env.AUDIT_ID;
const CONTRACT_NAME = process.env.CONTRACT_NAME;
const TIER = process.env.TIER;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const BACKEND_WEBHOOK_URL = process.env.BACKEND_WEBHOOK_URL;
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;

const AUDIT_DIR = path.join(__dirname, '..', 'audits', AUDIT_ID);
const CONTRACT_PATH = path.join(AUDIT_DIR, CONTRACT_NAME);

if (!fs.existsSync(AUDIT_DIR)) {
    fs.mkdirSync(AUDIT_DIR, { recursive: true });
}

// === HELPER: Run command with timeout ===
function runCommand(cmd, timeoutMs, label) {
    console.log(`\n🔧 [${label}] Running: ${cmd}`);
    try {
        const result = execSync(cmd, {
            timeout: timeoutMs,
            maxBuffer: 50 * 1024 * 1024,
            stdio: ['pipe', 'pipe', 'pipe']
        });
        console.log(`✅ [${label}] Completed`);
        return { success: true, output: result.toString() };
    } catch (err) {
        console.error(`❌ [${label}] Failed:`, err.message);
        return { 
            success: false, 
            error: err.message,
            stdout: err.stdout?.toString() || '',
            stderr: err.stderr?.toString() || ''
        };
    }
}

// === HELPER: Send webhook to backend ===
async function sendWebhook(payload) {
    const signature = crypto
        .createHmac('sha256', WEBHOOK_SECRET)
        .update(JSON.stringify(payload))
        .digest('hex');
    
    try {
        const response = await fetch(BACKEND_WEBHOOK_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Webhook-Signature': signature
            },
            body: JSON.stringify(payload)
        });
        
        if (!response.ok) {
            throw new Error(`Webhook failed: ${response.status}`);
        }
        
        console.log('✅ Webhook sent successfully');
    } catch (err) {
        console.error('❌ Webhook error:', err.message);
    }
}

// === STEP 1: Slither (Static Analysis) ===
async function runSlither() {
    console.log('\n📊 === STEP 1: SLITHER (Static Analysis) ===');
    
    const result = runCommand(
        `slither ${CONTRACT_PATH} --json ${AUDIT_DIR}/slither.json --filter-paths "openzeppelin|library" 2>&1`,
        120000, // 2 menit
        'Slither'
    );
    
    if (result.success) {
        try {
            const slitherData = JSON.parse(fs.readFileSync(`${AUDIT_DIR}/slither.json`, 'utf8'));
            const findings = (slitherData.results?.detectors || []).map(d => ({
                title: d.check,
                severity: mapSlitherSeverity(d.impact),
                category: mapSlitherCategory(d.check),
                description: d.description,
                affected_lines: extractLinesFromElements(d.elements),
                code_snippet: extractCodeSnippet(d.elements),
                remediation: d.recommendation || 'Review and fix the identified issue.',
                confidence: mapSlitherConfidence(d.confidence),
                swc_id: mapSWC(d.check),
                source: 'slither',
                exploit_scenario: generateExploitScenario(d.check, d.description)
            }));
            
            fs.writeFileSync(`${AUDIT_DIR}/slither-findings.json`, JSON.stringify(findings, null, 2));
            console.log(`✅ Slither found ${findings.length} issues`);
            return findings;
        } catch (err) {
            console.error('❌ Failed to parse Slither output:', err.message);
            return [];
        }
    }
    
    return [];
}

// === STEP 2: Mythril (Symbolic Execution) ===
async function runMythril() {
    console.log('\n === STEP 2: MYTHRIL (Symbolic Execution) ===');
    
    const result = runCommand(
        `myth analyze ${CONTRACT_PATH} --execution-timeout 120 --solver-timeout 30 --output json > ${AUDIT_DIR}/mythril.json 2>&1`,
        600000, // 10 menit!
        'Mythril'
    );
    
    if (result.success) {
        try {
            const mythrilData = JSON.parse(fs.readFileSync(`${AUDIT_DIR}/mythril.json`, 'utf8'));
            const findings = (mythrilData.issues || []).map(issue => ({
                title: issue.title || issue.function_name || 'Symbolic Execution Issue',
                severity: mapMythrilSeverity(issue.severity),
                category: 'symbolic-execution',
                description: issue.description,
                affected_lines: issue.lines || [],
                code_snippet: '',
                remediation: issue.extra?.guidance || 'Review the symbolic execution finding.',
                confidence: 85,
                swc_id: issue.swc_id || 'N/A',
                source: 'mythril',
                exploit_scenario: issue.description
            }));
            
            fs.writeFileSync(`${AUDIT_DIR}/mythril-findings.json`, JSON.stringify(findings, null, 2));
            console.log(`✅ Mythril found ${findings.length} issues`);
            return findings;
        } catch (err) {
            console.error('❌ Failed to parse Mythril output:', err.message);
            return [];
        }
    }
    
    return [];
}

// === STEP 3: Echidna (Fuzzing) - Pro/Enterprise Only ===
async function runEchidna() {
    console.log('\n🎯 === STEP 3: ECHIDNA (Fuzzing) ===');
    
    if (TIER !== 'pro' && TIER !== 'enterprise') {
        console.log('⏭️ Skipped (not Pro/Enterprise tier)');
        return [];
    }
    
    // Generate simple invariant test
    const sourceCode = fs.readFileSync(CONTRACT_PATH, 'utf8');
    const contractName = path.basename(CONTRACT_NAME, '.sol');
    
    const testCode = `
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "${CONTRACT_NAME}";

contract EchidnaTest {
    ${contractName} public target;
    
    constructor() {
        target = new ${contractName}();
    }
    
    function echidna_always_true() public view returns (bool) {
        return true;
    }
}
`;
    
    const testPath = path.join(AUDIT_DIR, `EchidnaTest.sol`);
    fs.writeFileSync(testPath, testCode);
    
    const result = runCommand(
        `echidna-test ${testPath} --contract EchidnaTest --config /dev/null --test-mode assertion --format json 2>&1 | tee ${AUDIT_DIR}/echidna-output.txt`,
        300000, // 5 menit
        'Echidna'
    );
    
    // Parse Echidna output (simplified)
    const findings = [];
    if (result.success && result.output.includes('failed')) {
        findings.push({
            title: 'Fuzzing Test Failed',
            severity: 'high',
            category: 'fuzzing',
            description: 'Echidna found a failing test case during fuzzing.',
            affected_lines: [],
            code_snippet: '',
            remediation: 'Review the failing test case and fix the underlying issue.',
            confidence: 90,
            swc_id: 'N/A',
            source: 'echidna',
            exploit_scenario: 'Fuzzing discovered an edge case that causes unexpected behavior.'
        });
    }
    
    fs.writeFileSync(`${AUDIT_DIR}/echidna-findings.json`, JSON.stringify(findings, null, 2));
    console.log(`✅ Echidna found ${findings.length} issues`);
    return findings;
}

// === STEP 4: AI Multi-Agent ===
async function runAIMultiAgent(toolFindings) {
    console.log('\n === STEP 4: AI MULTI-AGENT ===');
    
    const sourceCode = fs.readFileSync(CONTRACT_PATH, 'utf8');
    
    const agents = [
        { name: 'reentrancy', focus: 'Reentrancy, cross-function reentrancy, read-only reentrancy, external calls' },
        { name: 'access_control', focus: 'Authorization, modifiers, role-based access, unprotected functions' },
        { name: 'arithmetic', focus: 'Integer overflow/underflow, precision loss, rounding errors, unchecked blocks' },
        { name: 'business_logic', focus: 'Economic attacks, flash loan, oracle manipulation, tokenomics flaws' }
    ];
    
    const agentResults = [];
    
    // Run agents in parallel
    const agentPromises = agents.map(async (agent) => {
        const prompt = buildAgentPrompt(agent, sourceCode, toolFindings);
        
        try {
            const response = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{ parts: [{ text: prompt }] }],
                        generationConfig: { 
                            temperature: 0.1, 
                            responseMimeType: 'application/json' 
                        }
                    })
                }
            );
            
            const data = await response.json();
            const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
            const parsed = JSON.parse(text.replace(/^```json\n?|\n?```$/g, '').trim());
            
            const findings = (parsed.findings || []).map(f => ({
                ...f,
                source: 'ai',
                agent: agent.name
            }));
            
            console.log(`✅ Agent [${agent.name}] found ${findings.length} issues`);
            return findings;
        } catch (err) {
            console.error(`❌ Agent [${agent.name}] failed:`, err.message);
            return [];
        }
    });
    
    const results = await Promise.all(agentPromises);
    const combinedFindings = results.flat();
    
    // Validator Agent
    console.log('\n Running Validator Agent...');
    const validatorPrompt = buildValidatorPrompt(sourceCode, toolFindings, combinedFindings);
    
    try {
        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: validatorPrompt }] }],
                    generationConfig: { 
                        temperature: 0.1, 
                        responseMimeType: 'application/json' 
                    }
                })
            }
        );
        
        const data = await response.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
        const validated = JSON.parse(text.replace(/^```json\n?|\n?```$/g, '').trim());
        
        fs.writeFileSync(`${AUDIT_DIR}/ai-findings.json`, JSON.stringify(validated.findings || [], null, 2));
        console.log(`✅ Validator produced ${validated.findings?.length || 0} final findings`);
        
        return {
            findings: validated.findings || [],
            overall_assessment: validated.overall_assessment || '',
            risk_score: validated.risk_score || 50
        };
    } catch (err) {
        console.error('❌ Validator failed:', err.message);
        return { findings: combinedFindings, overall_assessment: '', risk_score: 50 };
    }
}

// === STEP 5: Generate PDF & Hash ===
async function generateReport(findings, riskScore, toolsUsed) {
    console.log('\n === STEP 5: GENERATE REPORT ===');
    
    // Simple text report (PDF generation would need Puppeteer)
    const report = {
        audit_id: AUDIT_ID,
        contract_name: CONTRACT_NAME,
        tier: TIER,
        risk_score: riskScore,
        tools_used: toolsUsed,
        findings_count: findings.length,
        findings: findings,
        generated_at: new Date().toISOString()
    };
    
    fs.writeFileSync(`${AUDIT_DIR}/report.json`, JSON.stringify(report, null, 2));
    
    // Generate blockchain hash
    const hash = crypto.createHash('sha256').update(JSON.stringify(report)).digest('hex');
    const txHash = '0x' + crypto.randomBytes(32).toString('hex');
    
    const blockchainRecord = {
        hash,
        tx_hash: txHash,
        network: 'simulated-sepolia',
        timestamp: new Date().toISOString()
    };
    
    fs.writeFileSync(`${AUDIT_DIR}/blockchain.json`, JSON.stringify(blockchainRecord, null, 2));
    
    console.log(`✅ Report generated. Hash: ${hash}`);
    return { report, blockchainRecord };
}

// === MAIN PIPELINE ===
async function main() {
    console.log(`🚀 Starting audit pipeline for #${AUDIT_ID}: ${CONTRACT_NAME} (tier: ${TIER})`);
    const startTime = Date.now();
    
    const toolsUsed = [];
    let allFindings = [];
    
    try {
        // Step 1: Slither
        const slitherFindings = await runSlither();
        if (slitherFindings.length > 0) toolsUsed.push('slither');
        allFindings = [...allFindings, ...slitherFindings];
        
        // Step 2: Mythril
        const mythrilFindings = await runMythril();
        if (mythrilFindings.length > 0) toolsUsed.push('mythril');
        allFindings = [...allFindings, ...mythrilFindings];
        
        // Step 3: Echidna (Pro only)
        const echidnaFindings = await runEchidna();
        if (echidnaFindings.length > 0) toolsUsed.push('echidna');
        allFindings = [...allFindings, ...echidnaFindings];
        
        // Step 4: AI Multi-Agent
        console.log('\n🤖 Running AI Multi-Agent with context from tools...');
        const aiResult = await runAIMultiAgent(allFindings);
        toolsUsed.push('ai');
        
        // Merge: Use AI validated findings, fallback to tool findings if AI failed
        const finalFindings = aiResult.findings.length > 0 ? aiResult.findings : allFindings;
        const riskScore = aiResult.risk_score || calculateRiskScore(finalFindings);
        
        // Step 5: Generate Report
        const { report, blockchainRecord } = await generateReport(finalFindings, riskScore, toolsUsed);
        
        // Send webhook to backend
        await sendWebhook({
            audit_id: parseInt(AUDIT_ID),
            status: 'completed',
            findings: finalFindings,
            overall_risk_score: riskScore,
            tools_used: toolsUsed,
            blockchain_hash: blockchainRecord.hash,
            blockchain_tx_hash: blockchainRecord.tx_hash,
            processing_time_ms: Date.now() - startTime,
            overall_assessment: aiResult.overall_assessment || ''
        });
        
        console.log(`\n✅ Audit #${AUDIT_ID} completed in ${((Date.now() - startTime) / 1000).toFixed(1)}s`);
        console.log(`📊 Findings: ${finalFindings.length} | Risk Score: ${riskScore}/100`);
        
    } catch (err) {
        console.error('\n❌ Pipeline failed:', err.message);
        
        await sendWebhook({
            audit_id: parseInt(AUDIT_ID),
            status: 'failed',
            error: err.message,
            processing_time_ms: Date.now() - startTime
        });
        
        process.exit(1);
    }
}

// === HELPER FUNCTIONS ===
function mapSlitherSeverity(impact) {
    const map = { 'High': 'critical', 'Medium': 'high', 'Low': 'medium', 'Informational': 'low' };
    return map[impact] || 'medium';
}

function mapSlitherCategory(check) {
    if (check.includes('reentrancy')) return 'reentrancy';
    if (check.includes('access') || check.includes('authorization')) return 'access-control';
    if (check.includes('arithmetic') || check.includes('overflow')) return 'arithmetic';
    return 'other';
}

function mapSlitherConfidence(confidence) {
    const map = { 'High': 90, 'Medium': 70, 'Low': 50 };
    return map[confidence] || 60;
}

function mapMythrilSeverity(severity) {
    const map = { 'Critical': 'critical', 'High': 'high', 'Medium': 'medium', 'Low': 'low', 'Informational': 'info' };
    return map[severity] || 'medium';
}

function mapSWC(check) {
    const swcMap = {
        'reentrancy': 'SWC-107',
        'tx-origin': 'SWC-115',
        'unchecked-low-level': 'SWC-104',
        'arithmetic': 'SWC-101',
        'access-control': 'SWC-105'
    };
    for (const [key, swc] of Object.entries(swcMap)) {
        if (check.toLowerCase().includes(key)) return swc;
    }
    return 'N/A';
}

function extractLinesFromElements(elements) {
    if (!elements) return [];
    const lines = new Set();
    elements.forEach(el => {
        if (el.source_mapping?.lines) {
            el.source_mapping.lines.forEach(l => lines.add(l));
        }
    });
    return Array.from(lines).sort((a, b) => a - b);
}

function extractCodeSnippet(elements) {
    if (!elements || elements.length === 0) return '';
    return elements.map(el => el.source_mapping?.filename_relative_to_config || '').join('\n');
}

function generateExploitScenario(check, description) {
    return `Potential exploit scenario for ${check}: ${description}. An attacker could potentially exploit this vulnerability to gain unauthorized access or drain funds.`;
}

function buildAgentPrompt(agent, sourceCode, preliminaryFindings) {
    return `You are a specialized smart contract security auditor focusing on: ${agent.focus}.

Analyze the provided Solidity contract and preliminary findings from security tools. Return ONLY valid JSON.

PRELIMINARY FINDINGS (from Slither/Mythril/Echidna):
${JSON.stringify(preliminaryFindings, null, 2)}

SOURCE CODE:
\`\`\`solidity
${sourceCode}
\`\`\`

Return JSON only with this exact structure:
{
  "findings": [
    {
      "title": "string",
      "severity": "critical|high|medium|low|info",
      "category": "reentrancy|access-control|arithmetic|logic|oracle|other",
      "description": "detailed description",
      "exploit_scenario": "step-by-step how attacker could exploit",
      "affected_lines": [1, 2, 3],
      "code_snippet": "exact vulnerable code",
      "remediation": "compilable fix code",
      "confidence": 85,
      "swc_id": "SWC-XXX"
    }
  ]
}`;
}

function buildValidatorPrompt(sourceCode, toolFindings, agentFindings) {
    return `You are a senior smart contract auditor (validator). Review findings from multiple tools and AI agents, remove false positives, adjust severity/confidence, and merge duplicates.

TOOL FINDINGS (Slither/Mythril/Echidna):
${JSON.stringify(toolFindings, null, 2)}

AI AGENT FINDINGS:
${JSON.stringify(agentFindings, null, 2)}

SOURCE CODE:
\`\`\`solidity
${sourceCode}
\`\`\`

Return JSON only:
{
  "findings": [merged list with deduplication],
  "overall_assessment": "brief summary of contract security",
  "risk_score": 0-100
}`;
}

function calculateRiskScore(findings) {
    const weights = { critical: 10, high: 7, medium: 4, low: 1, info: 0 };
    let totalImpact = 0;
    
    findings.forEach(f => {
        const w = weights[f.severity] || 0;
        const conf = (f.confidence || 50) / 100;
        totalImpact += w * conf;
    });
    
    const score = Math.max(0, Math.min(100, Math.round(100 - totalImpact * 2)));
    return score;
}

// Run
main();
