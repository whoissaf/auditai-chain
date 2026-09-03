const token = localStorage.getItem('token');
const user = JSON.parse(localStorage.getItem('user') || '{}');

function showToast(message, type = 'error') {
    const existingToast = document.querySelector('.toast');
    if (existingToast) existingToast.remove();
    
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.style.animation = 'slideIn 0.3s ease-out reverse';
        setTimeout(() => toast.remove(), 300);
    }, 5000);
}

if (!token) {
    window.location.href = '/';
} else {
    const userNameEl = document.getElementById('userName');
    if (userNameEl) userNameEl.textContent = user.email || 'User';
}

const logoutBtn = document.getElementById('logoutBtn');
if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        window.location.href = '/';
    });
}

async function loadUsageStats() {
    try {
        const res = await fetch('/api/audits/usage', { headers: { 'Authorization': 'Bearer ' + token } });
        const data = await res.json();
        
        const els = {
            userTier: document.getElementById('userTier'),
            lineLimit: document.getElementById('lineLimit'),
            auditsUsed: document.getElementById('auditsUsed'),
            auditsLimit: document.getElementById('auditsLimit'),
            linesScanned: document.getElementById('linesScanned'),
            maxFilesLimit: document.getElementById('maxFilesLimit')
        };
        
        if (els.userTier) els.userTier.textContent = data.tier_name;
        if (els.lineLimit) els.lineLimit.textContent = data.limits.max_lines_per_audit.toLocaleString();
        if (els.auditsUsed) els.auditsUsed.textContent = data.usage.audits_this_month;
        if (els.auditsLimit) els.auditsLimit.textContent = data.limits.max_audits_per_month;
        if (els.linesScanned) els.linesScanned.textContent = data.usage.lines_scanned_this_month.toLocaleString();
        if (els.maxFilesLimit) els.maxFilesLimit.textContent = data.limits.max_files || 1;
        
        window.userLimits = data.limits;
    } catch (err) {
        console.error('Failed to load usage stats:', err);
    }
}

if (document.getElementById('userTier')) loadUsageStats();

// --- SINGLE FILE AUDIT ---
const auditForm = document.getElementById('auditForm');
if (auditForm) {
    auditForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const contractName = document.getElementById('contractName').value;
        const compilerVersion = document.getElementById('compilerVersion').value;
        const sourceCode = document.getElementById('sourceCode').value;
        
        const linesOfCode = sourceCode.split('\n').length;
        if (window.userLimits && linesOfCode > window.userLimits.max_lines_per_audit) {
            showToast(`File exceeds line limit. Max: ${window.userLimits.max_lines_per_audit}, Yours: ${linesOfCode}`, 'error');
            return;
        }
        
        const submitBtn = document.getElementById('submitBtn');
        const loadingState = document.getElementById('loadingState');
        const resultState = document.getElementById('resultState');
        
        submitBtn.disabled = true;
        submitBtn.innerHTML = 'Processing...';
        loadingState.classList.remove('hidden');
        resultState.classList.add('hidden');
        
        try {
            const res = await fetch('/api/audits', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
                body: JSON.stringify({ contract_name: contractName, compiler_version: compilerVersion, source_code: sourceCode })
            });
            
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Audit failed');
            
            showToast('Audit started successfully!', 'success');
            await loadResults(data.audit_id);
        } catch (err) {
            showToast('Error: ' + err.message, 'error');
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerHTML = 'Mulai Analisis AI';
            loadingState.classList.add('hidden');
        }
    });
}

// --- MULTI-FILE AUDIT ---
const multiFileUpload = document.getElementById('multiFileUpload');
const fileList = document.getElementById('fileList');
const multiFileForm = document.getElementById('multiFileForm');

if (multiFileUpload) {
    // Handle file selection display
    multiFileUpload.addEventListener('change', (e) => {
        fileList.innerHTML = '';
        const files = Array.from(e.target.files);
        files.forEach(file => {
            const div = document.createElement('div');
            div.className = 'file-item';
            div.innerHTML = `<span>${file.name}</span><span style="color: #94a3b8;">${(file.size / 1024).toFixed(1)} KB</span>`;
            fileList.appendChild(div);
        });
    });

    // Handle form submission
    if (multiFileForm) {
        multiFileForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const files = Array.from(multiFileUpload.files);
            
            if (files.length === 0) {
                showToast('Silakan pilih file terlebih dahulu', 'warning');
                return;
            }

            if (window.userLimits && files.length > (window.userLimits.max_files || 1)) {
                showToast(`File count exceeds limit. Max: ${window.userLimits.max_files || 1} files`, 'error');
                multiFileUpload.value = '';
                fileList.innerHTML = '';
                return;
            }

            const formData = new FormData();
            files.forEach(file => {
                formData.append('contract_files', file);
            });

            const submitBtn = document.getElementById('multiFileSubmitBtn');
            const loadingState = document.getElementById('loadingState');
            const resultState = document.getElementById('resultState');

            submitBtn.disabled = true;
            submitBtn.innerHTML = 'Uploading & Processing...';
            loadingState.classList.remove('hidden');
            resultState.classList.add('hidden');

            try {
                const res = await fetch('/api/audits/multi-file', {
                    method: 'POST',
                    headers: { 'Authorization': 'Bearer ' + token },
                    body: formData
                });

                const data = await res.json();
                if (!res.ok) throw new Error(data.error || 'Multi-file audit failed');
                
                showToast(`Successfully analyzed ${data.files_count} files!`, 'success');
                await loadResults(data.audit_id);
            } catch (err) {
                showToast('Error: ' + err.message, 'error');
            } finally {
                submitBtn.disabled = false;
                submitBtn.innerHTML = 'Mulai Analisis Multi-File';
                loadingState.classList.add('hidden');
                multiFileUpload.value = '';
                fileList.innerHTML = '';
            }
        });
    }
}

// --- SHARED FUNCTIONS ---
async function loadResults(auditId) {
    try {
        const auditRes = await fetch('/api/audits/' + auditId, { headers: { 'Authorization': 'Bearer ' + token } });
        const auditData = await auditRes.json();
        
        const findingsRes = await fetch('/api/audits/' + auditId + '/findings', { headers: { 'Authorization': 'Bearer ' + token } });
        const findingsData = await findingsRes.json();
        
        const els = {
            resultContractName: document.getElementById('resultContractName'),
            resultMeta: document.getElementById('resultMeta'),
            riskScore: document.getElementById('riskScore'),
            container: document.getElementById('findingsContainer')
        };
        
        if (els.resultContractName) els.resultContractName.textContent = auditData.audit.contract_name;
        if (els.resultMeta) els.resultMeta.textContent = auditData.audit.lines_of_code + ' lines • ' + auditData.audit.status;
        if (els.riskScore) els.riskScore.textContent = auditData.audit.overall_risk_score + '/100';
        
        if (els.container) {
            els.container.innerHTML = '';
            findingsData.findings.forEach(finding => {
                const colorClass = finding.severity === 'critical' ? 'critical' : finding.severity === 'high' ? 'high' : finding.severity === 'medium' ? 'medium' : 'low';
                
                const html = `
                    <div class="finding ${colorClass}">
                        <div class="finding-header toggle-finding">
                            <div>
                                <div class="finding-title">[${finding.severity.toUpperCase()}] ${finding.title}</div>
                                <div class="finding-meta">Confidence: ${finding.confidence_score}% • ${finding.swc_id || 'N/A'}</div>
                            </div>
                            <span class="finding-line">Lines: ${finding.affected_lines.join(', ')}</span>
                        </div>
                        <div class="finding-body">
                            <div class="finding-section">
                                <div class="finding-section-title">Description:</div>
                                <div class="finding-description">${finding.description}</div>
                            </div>
                            <div class="finding-section">
                                <div class="finding-section-title">Code Snippet:</div>
                                <pre class="code-block"><code class="language-solidity">${finding.code_snippet.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</code></pre>
                            </div>
                            <div class="finding-section">
                                <div class="finding-section-title" style="color: #10b981;">Remediation:</div>
                                <div class="remediation">${finding.remediation}</div>
                            </div>
                        </div>
                    </div>
                `;
                els.container.innerHTML += html;
            });
            
            document.querySelectorAll('.toggle-finding').forEach(header => {
                header.addEventListener('click', function() {
                    this.nextElementSibling.classList.toggle('active');
                });
            });
            
            if (typeof Prism !== 'undefined') Prism.highlightAll();
        }
        
        const resultState = document.getElementById('resultState');
        if (resultState) resultState.classList.remove('hidden');
        window.currentAuditId = auditId;
    } catch (err) {
        console.error(err);
        showToast('Failed to load results', 'error');
    }
}

const exportPdfBtn = document.getElementById('exportPdfBtn');
if (exportPdfBtn) {
    exportPdfBtn.addEventListener('click', async function() {
        if (!window.currentAuditId) {
            showToast('No audit selected', 'warning');
            return;
        }
        
        const btn = this;
        const originalText = btn.innerHTML;
        btn.innerHTML = 'Generating...';
        btn.disabled = true;
        
        try {
            const res = await fetch('/api/audits/' + window.currentAuditId + '/export', {
                method: 'POST',
                headers: { 'Authorization': 'Bearer ' + token }
            });
            const data = await res.json();
            
            if (!res.ok) throw new Error(data.error || 'Export failed');
            
            if (data.download_url) {
                window.open(data.download_url, '_blank');
                showToast('PDF berhasil dibuat! Hash: ' + data.blockchain_tx_hash, 'success');
            }
        } catch (err) {
            showToast('Gagal membuat PDF: ' + err.message, 'error');
        } finally {
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
    });
}
