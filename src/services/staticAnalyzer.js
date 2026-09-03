const analyze = (sourceCode) => {
    const findings = [];
    const lines = sourceCode.split('\n');
    
    if (/pragma\s+solidity\s+[\^<>=\s0-9.]+;/.test(sourceCode) && !/pragma\s+solidity\s+[0-9]+\.[0-9]+\.[0-9]+;/.test(sourceCode)) {
        findings.push({
            title: 'Floating Pragma',
            severity: 'low',
            category: 'best-practice',
            description: 'The pragma version is not pinned to an exact version.',
            affected_lines: [1],
            code_snippet: lines[0] || 'pragma solidity',
            remediation: 'Pin the pragma to an exact version, e.g., pragma solidity 0.8.19;',
            confidence_score: 100,
            swc_id: 'SWC-103'
        });
    }

    const txOriginMatches = [...sourceCode.matchAll(/tx\.origin/g)];
    if (txOriginMatches.length > 0) {
        const uniqueLines = [...new Set(txOriginMatches.map(m => sourceCode.substring(0, m.index).split('\n').length))];
        findings.push({
            title: 'Use of tx.origin for Authentication',
            severity: 'high',
            category: 'access-control',
            description: 'Using tx.origin for authorization is vulnerable to phishing attacks.',
            affected_lines: uniqueLines,
            code_snippet: 'tx.origin',
            remediation: 'Use msg.sender instead of tx.origin for authentication.',
            confidence_score: 100,
            swc_id: 'SWC-115'
        });
    }

    const callMatches = [...sourceCode.matchAll(/\.call\{[^}]*\}\([^)]*\)/g)];
    callMatches.forEach(match => {
        const lineNum = sourceCode.substring(0, match.index).split('\n').length;
        if (!sourceCode.includes(`require(${match[0]}`) && !sourceCode.includes(`if (${match[0]}`)) {
            findings.push({
                title: 'Unchecked Low-Level Call',
                severity: 'high',
                category: 'reentrancy',
                description: 'The return value of a low-level call is not checked.',
                affected_lines: [lineNum],
                code_snippet: match[0],
                remediation: 'Always check the return value of low-level calls.',
                confidence_score: 90,
                swc_id: 'SWC-104'
            });
        }
    });

    return findings;
};

module.exports = { analyze };
