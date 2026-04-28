// Main App Controller
document.addEventListener('DOMContentLoaded', () => {
    console.log("Kontigo Tracker Initializing...");
    
    initCharts();
    refreshUI();

    // Set today as default date
    const dateInput = document.getElementById('tx-date');
    if (dateInput) dateInput.value = new Date().toISOString().split('T')[0];

    // Initialize manual balance inputs
    const db = loadDB();
    document.getElementById('manual-ves').value = db.manualKontigoVES || '';
    document.getElementById('manual-usd').value = db.manualKontigoUSD || '';

    // Fetch Rate if API configured
    if (db.settings.apiKey && db.settings.organizationId) {
        fetchExchangeRate();
    }

    // Event Listeners
    document.getElementById('tx-form')?.addEventListener('submit', handleNewTransaction);
    document.getElementById('tx-type')?.addEventListener('change', (e) => {
        const rateField = document.getElementById('rate-field');
        if (e.target.value === 'carga') {
            rateField.classList.remove('hidden');
        } else {
            rateField.classList.add('hidden');
        }
    });

    // PWA Service Worker
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js')
            .then(() => console.log("SW Registered"));
    }
});

function refreshUI() {
    const stats = calculateStats();
    const db = loadDB();

    // Update Dashboard
    updateStat('stat-total-added', `Bs. ${stats.totalAddedVES.toLocaleString('es-VE', {minimumFractionDigits: 2})}`);
    updateStat('stat-kontigo-balance', `$ ${stats.kontigoUSD.toLocaleString('en-US', {minimumFractionDigits: 2})}`);
    updateStat('stat-kontigo-ves', `Bs. ${stats.kontigoVES.toLocaleString('es-VE', {minimumFractionDigits: 2})}`);
    updateStat('stat-diff-ves', `Bs. ${stats.diffVES.toLocaleString('es-VE', {minimumFractionDigits: 2})}`);
    
    const diffUSD = stats.diffVES / db.exchangeRate;
    updateStat('stat-diff-usd', `(${diffUSD >= 0 ? '+' : ''}$ ${diffUSD.toLocaleString('en-US', {minimumFractionDigits: 2})})`);
    
    const efficiency = stats.efficiency.toFixed(1);
    const effEl = document.getElementById('stat-efficiency');
    effEl.textContent = `${stats.efficiency >= 0 ? '+' : ''}${efficiency}%`;
    effEl.className = `text-3xl font-black ${stats.efficiency >= 0 ? 'text-emerald-400' : 'text-red-400'}`;
    
    document.getElementById('efficiency-bar').style.width = `${Math.min(Math.abs(stats.efficiency), 100)}%`;
    document.getElementById('efficiency-bar').className = `h-full transition-all duration-1000 ${stats.efficiency >= 0 ? 'bg-emerald-400' : 'bg-red-400'}`;

    // Meta Progress
    const goal = db.settings.monthlyGoal || 5000;
    const progress = (stats.totalAddedVES / goal) * 100;
    document.getElementById('diff-percent').textContent = `${progress.toFixed(0)}% de tu meta (Bs. ${goal})`;

    // Refresh List
    renderTransactionList(db.transactions);
    renderPeriodReports(appState.currentReportTab || 'monthly');
    
    // Update Charts
    updateCharts(stats.historyPct);
}

let appState = {
    currentReportTab: 'monthly'
};

async function fetchExchangeRate() {
    const db = loadDB();
    const { organizationId, apiKey } = db.settings;
    
    // Try Kontigo API first
    if (organizationId && apiKey) {
        try {
            const options = {
                method: 'GET',
                headers: {
                    accept: 'application/json',
                    'x-api-key': apiKey
                }
            };
            const response = await fetch(`https://api.kontigo.lat/v1/organizations/${organizationId}/exchange-rates?destination=on_ramp`, options);
            const data = await response.json();
            
            if (data && data.rate) {
                db.exchangeRate = data.rate;
                saveDB(db);
                const sourceEl = document.getElementById('rate-source');
                if (sourceEl) {
                    sourceEl.textContent = 'Kontigo API';
                    sourceEl.className = 'text-[8px] font-black px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 uppercase';
                }
                refreshUI();
                return;
            }
        } catch (err) {
            console.warn("Kontigo API failed, trying fallback...", err);
        }
    }

    // Fallback to DolarApi (BCV/EnParaleloVzla)
    try {
        const response = await fetch('https://ve.dolarapi.com/v1/dolares/oficial');
        const data = await response.json();
        if (data && data.promedio) {
            db.exchangeRate = data.promedio;
            saveDB(db);
            const sourceEl = document.getElementById('rate-source');
            if (sourceEl) {
                sourceEl.textContent = 'Public API (BCV)';
                sourceEl.className = 'text-[8px] font-black px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 uppercase';
            }
            refreshUI();
        }
    } catch (err) {
        console.error("Public API failed:", err);
    }
}

function updateStat(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
}

function handleNewTransaction(e) {
    e.preventDefault();
    const type = document.getElementById('tx-type').value;
    const amount = parseFloat(document.getElementById('tx-amount').value);
    const date = document.getElementById('tx-date').value;
    const rate = parseFloat(document.getElementById('tx-rate').value) || null;
    const note = document.getElementById('tx-note').value;

    if (isNaN(amount)) return;

    addTransaction({
        type,
        amount,
        rate,
        note,
        date: date ? new Date(date + 'T12:00:00').toISOString() : new Date().toISOString()
    });

    e.target.reset();
    document.getElementById('tx-date').value = new Date().toISOString().split('T')[0];
    document.getElementById('rate-field').classList.add('hidden');
    refreshUI();
}

function saveManualBalance() {
    const ves = parseFloat(document.getElementById('manual-ves').value) || 0;
    const usd = parseFloat(document.getElementById('manual-usd').value) || 0;
    
    updateManualBalances(ves, usd);
    refreshUI();
    
    // Visual feedback
    const btn = document.querySelector('button[onclick="saveManualBalance()"]');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-check-double"></i> Sincronizado';
    btn.classList.replace('bg-emerald-600', 'bg-blue-600');
    setTimeout(() => {
        btn.innerHTML = originalText;
        btn.classList.replace('bg-blue-600', 'bg-emerald-600');
    }, 2000);
}

function renderTransactionList(transactions) {
    const container = document.getElementById('tx-list');
    if (!container) return;

    const sorted = [...transactions].sort((a, b) => new Date(b.date) - new Date(a.date));
    
    container.innerHTML = sorted.map(tx => `
        <tr class="group hover:bg-white/[0.02] transition-all">
            <td class="py-4 text-xs font-bold text-slate-500">${new Date(tx.date).toLocaleDateString()}</td>
            <td class="py-4">
                <span class="px-2 py-1 rounded-md text-[10px] font-black uppercase bg-white/5 type-${tx.type}">
                    ${tx.type === 'ingreso' ? 'Ingreso' : tx.type === 'carga' ? 'Carga' : tx.type === 'retiro' ? 'Retiro' : 'Gasto'}
                </span>
            </td>
            <td class="py-4 font-black text-sm">
                Bs. ${tx.amount.toLocaleString('es-VE')}
                <p class="text-[10px] text-slate-500 font-bold">$ ${tx.usdAmount ? tx.usdAmount.toLocaleString('en-US', {minimumFractionDigits: 2}) : (tx.amount / (tx.rate || db.exchangeRate)).toLocaleString('en-US', {minimumFractionDigits: 2})}</p>
            </td>
            <td class="py-4 text-xs text-slate-400 italic">${tx.note || '—'}</td>
            <td class="py-4 text-right">
                <button onclick="removeTx(${tx.id})" class="opacity-0 group-hover:opacity-100 text-red-500/50 hover:text-red-500 transition-all p-2">
                    <i class="fas fa-trash-alt"></i>
                </button>
            </td>
        </tr>
    `).join('') || '<tr><td colspan="5" class="py-10 text-center text-slate-600 italic">No hay movimientos registrados</td></tr>';
}

function removeTx(id) {
    if (confirm("¿Eliminar este movimiento?")) {
        deleteTransaction(id);
        refreshUI();
    }
}

function switchReportTab(tab) {
    appState.currentReportTab = tab;
    // Update button styles
    ['monthly', 'quarterly', 'annual'].forEach(t => {
        const btn = document.getElementById(`rpt-btn-${t}`);
        if (btn) {
            btn.className = t === tab 
                ? 'px-3 py-1 text-[10px] font-bold rounded-md bg-blue-600 text-white transition-all'
                : 'px-3 py-1 text-[10px] font-bold rounded-md text-slate-500 hover:bg-white/5 transition-all';
        }
    });
    renderPeriodReports(tab);
}

function renderPeriodReports(tab) {
    const container = document.getElementById('period-summary');
    if (!container) return;

    const reports = getPeriodReports();
    const periods = Object.keys(reports[tab]).sort().reverse();

    if (periods.length === 0) {
        container.innerHTML = '<div class="text-center py-10 opacity-30 text-xs italic">No hay datos suficientes</div>';
        return;
    }

    container.innerHTML = periods.map(p => {
        const data = reports[tab][p];
        const balance = data.ingresos - data.gastos - data.retiros;
        return `
        <div class="p-4 bg-white/5 rounded-xl border border-white/5 space-y-3">
            <div class="flex justify-between items-center">
                <span class="text-xs font-black capitalize text-blue-400">${p}</span>
                <span class="text-[10px] font-bold text-slate-500">Saldo: Bs. ${balance.toLocaleString()}</span>
            </div>
            <div class="grid grid-cols-2 gap-2 text-[10px] font-bold">
                <div class="p-2 bg-slate-900/50 rounded-lg">
                    <p class="text-slate-500 uppercase mb-1">Ingresos</p>
                    <p class="text-white">Bs. ${data.ingresos.toLocaleString()}</p>
                </div>
                <div class="p-2 bg-slate-900/50 rounded-lg">
                    <p class="text-slate-500 uppercase mb-1">Cargas</p>
                    <p class="text-emerald-400">Bs. ${data.cargas.toLocaleString()}</p>
                </div>
                <div class="p-2 bg-slate-900/50 rounded-lg">
                    <p class="text-slate-500 uppercase mb-1">Retiros</p>
                    <p class="text-amber-500">Bs. ${data.retiros.toLocaleString()}</p>
                </div>
                <div class="p-2 bg-slate-900/50 rounded-lg">
                    <p class="text-slate-500 uppercase mb-1">Gastos</p>
                    <p class="text-red-400">Bs. ${data.gastos.toLocaleString()}</p>
                </div>
            </div>
        </div>
        `;
    }).join('');
}

// Modal Handlers
function openBackupModal() { document.getElementById('backup-modal').classList.remove('hidden'); }
function openSettings() { 
    const db = loadDB();
    document.getElementById('cfg-fee-load').value = db.settings.feeLoad;
    document.getElementById('cfg-fee-exit').value = db.settings.feeExit;
    document.getElementById('cfg-org-id').value = db.settings.organizationId || '';
    document.getElementById('cfg-api-key').value = db.settings.apiKey || '';
    document.getElementById('cfg-monthly-goal').value = db.settings.monthlyGoal;
    document.getElementById('settings-modal').classList.remove('hidden'); 
}
function closeModal(id) { document.getElementById(id).classList.add('hidden'); }

function saveSettings() {
    updateSettings({
        feeLoad: parseFloat(document.getElementById('cfg-fee-load').value),
        feeExit: parseFloat(document.getElementById('cfg-fee-exit').value),
        organizationId: document.getElementById('cfg-org-id').value,
        apiKey: document.getElementById('cfg-api-key').value,
        monthlyGoal: parseFloat(document.getElementById('cfg-monthly-goal').value)
    });
    closeModal('settings-modal');
    refreshUI();
    // Re-fetch rate with new keys
    fetchExchangeRate();
}

// Sync Functions
function exportData(mode) {
    const data = localStorage.getItem(DB_KEY);
    const fileName = `kontigo_backup_${new Date().toISOString().split('T')[0]}.json`;
    
    if (mode === 'download') {
        const blob = new Blob([data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        a.click();
    } else {
        if (navigator.share) {
            const file = new File([data], fileName, { type: 'application/json' });
            navigator.share({ title: 'Respaldo Kontigo', files: [file] }).catch(console.error);
        } else {
            alert("Compartir no disponible. Usa Descargar.");
        }
    }
}

function importData() {
    const input = document.getElementById('import-file');
    if (!input.files[0]) return;
    
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const json = e.target.result;
            JSON.parse(json); // Validate
            localStorage.setItem(DB_KEY, json);
            alert("Datos restaurados correctamente.");
            window.location.reload();
        } catch (err) {
            alert("Archivo inválido.");
        }
    };
    reader.readAsText(input.files[0]);
}

function clearHistory() {
    if (confirm("¿Estás SEGURO de que quieres borrar todo el historial? Esta acción no se puede deshacer.")) {
        saveDB(initialDB);
        window.location.reload();
    }
}
