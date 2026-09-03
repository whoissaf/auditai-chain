const token = localStorage.getItem('token');
const user = JSON.parse(localStorage.getItem('user') || '{}');

if (!token) {
    window.location.href = '/';
} else {
    const userNameEl = document.getElementById('userName');
    if (userNameEl) userNameEl.textContent = user.email || 'User';
}

document.getElementById('logoutBtn').addEventListener('click', () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = '/';
});

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

async function loadBillingData() {
    try {
        const res = await fetch('/api/billing/subscription', {
            headers: { 'Authorization': 'Bearer ' + token }
        });
        const data = await res.json();
        
        const currentTier = data.current_tier || 'free';
        document.getElementById('currentTier').textContent = currentTier.charAt(0).toUpperCase() + currentTier.slice(1);
        
        // Highlight current tier card
        const currentCard = document.getElementById(`card-${currentTier}`);
        if (currentCard) {
            currentCard.classList.add('current');
            const btn = currentCard.querySelector('button');
            if (btn) {
                btn.className = 'btn btn-disabled';
                btn.disabled = true;
                btn.textContent = currentTier === 'free' ? 'Paket Saat Ini' : 'Paket Aktif';
            }
        }

        // If we have subscription data, show usage
        if (data.subscription) {
            // Note: In a real app, you'd fetch actual usage from a usage endpoint.
            // For now, we'll fetch from the audit usage endpoint to populate stats.
            const usageRes = await fetch('/api/audits/usage', {
                headers: { 'Authorization': 'Bearer ' + token }
            });
            const usageData = await usageRes.json();
            
            document.getElementById('auditsUsed').textContent = usageData.usage.audits_this_month;
            document.getElementById('auditsLimit').textContent = usageData.limits.max_audits_per_month;
            document.getElementById('lineLimit').textContent = usageData.limits.max_lines_per_audit.toLocaleString();
        }
    } catch (err) {
        console.error('Failed to load billing data:', err);
        showToast('Gagal memuat data billing', 'error');
    }
}

// Handle Upgrade Buttons
document.querySelectorAll('.upgrade-btn').forEach(btn => {
    btn.addEventListener('click', async function() {
        const tier = this.getAttribute('data-tier');
        this.disabled = true;
        this.textContent = 'Memproses...';
        
        try {
            const res = await fetch('/api/billing/upgrade', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + token 
                },
                body: JSON.stringify({ tier: tier })
            });
            
            const data = await res.json();
            
            if (!res.ok) {
                throw new Error(data.error || 'Gagal membuat sesi pembayaran');
            }
            
            if (data.checkout_url) {
                showToast('Mengalihkan ke Stripe Checkout...', 'success');
                setTimeout(() => {
                    window.location.href = data.checkout_url;
                }, 1000);
            }
        } catch (err) {
            showToast('Error: ' + err.message, 'error');
            this.disabled = false;
            this.textContent = `Upgrade ke ${tier.charAt(0).toUpperCase() + tier.slice(1)}`;
        }
    });
});

// Load data on page load
loadBillingData();
