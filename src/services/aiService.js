const axios = require('axios');

const analyzeWithAI = async (sourceCode, staticFindings) => {
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    
    if (!GEMINI_API_KEY) {
        throw new Error('GEMINI_API_KEY tidak ditemukan. Pastikan sudah diatur di file .env');
    }

    const prompt = 'You are an expert smart contract security auditor. Analyze this Solidity code for vulnerabilities.\nStatic findings: ' + JSON.stringify(staticFindings) + '\nCode:\n```solidity\n' + sourceCode + '\n```\nReturn ONLY valid JSON:\n{\n  "findings": [{"title": "Name", "severity": "critical|high|medium|low|info", "category": "reentrancy|etc", "description": "Desc", "affected_lines": [1], "code_snippet": "code", "remediation": "fix", "confidence_score": 90, "swc_id": "SWC-107"}],\n  "overall_risk_score": 75,\n  "summary": "Summary",\n  "recommendations": ["Rec 1"]\n}';

    try {
        console.log('Attempting AI analysis with Google Gemini 2.5 Flash...');
        const response = await axios.post('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=' + GEMINI_API_KEY, {
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.1, responseMimeType: 'application/json' }
        }, {
            headers: { 'Content-Type': 'application/json' },
            timeout: 30000
        });
        
        const text = response.data.candidates[0].content.parts[0].text;
        const result = JSON.parse(text.replace(/^```json\n?|\n?```$/g, '').trim());
        
        console.log('✅ AI analysis successful with Google Gemini.');
        return result;
    } catch (error) {
        console.error('❌ AI analysis failed with Gemini:', error.response ? error.response.status : error.message);
        if (error.response && error.response.data) {
            console.error('Detail:', JSON.stringify(error.response.data));
        }
        throw new Error('AI provider failed.');
    }
};

module.exports = { analyzeWithAI };
