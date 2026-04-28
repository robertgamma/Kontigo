// Main App Controller
document.addEventListener('DOMContentLoaded', () => {
    console.log("Kontigo Tracker Initializing...");
    
    initCharts();
    refreshUI();

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
    updateStat('stat-diff-ves', `Bs. ${stats.diffVES.toLocaleString('es-VE', {minimumFractionDigits: 2})}`);
    
    const diffUSD = stats.diffVES / db.exchangeRate;
    updateStat('stat-diff-usd', `($ ${diffUSD.toLocaleString('en-US', {minimumFractionDigits: 2})})`);
    
    const efficiency = stats.efficiency.toFixed(1);
    updateStat('stat-efficiency', `${efficiency}%`);
    document.getElementById('efficiency-bar').style.width = `${Math.min(efficiency, 100)}%`;

    // Meta Progress
    const goal = db.settings.monthlyGoal || 5000;
    const progress = (stats.totalAddedVES / goal) * 100;
    document.getElementById('diff-percent').textContent = `${progress.toFixed(0)}% de tu meta (Bs. ${goal})`;

    // Refresh List
    renderTransactionList(db.transactions);
    renderMonthlySummary(db.transactions);
    
    // Update Charts
    updateCharts(stats.historyUSD);
}

function updateStat(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
}

function handleNewTransaction(e) {
    e.preventDefault();
    const type = document.getElementById('tx-type').value;
    const amount = parseFloat(document.getElementById('tx-amount').value);
    const rate = parseFloat(document.getElementById('tx-rate').value) || null;
    const note = document.getElementById('tx-note').value;

    if (isNaN(amount)) return;

    addTransaction({
        type,
        amount,
        rate,
        note,
        date: new Date().toISOString()
    });

    e.target.reset();
    document.getElementById('rate-field').classList.add('hidden');
    refreshUI();
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
                    ${tx.type === 'ingreso' ? 'Ingreso' : tx.type === 'carga' ? 'Carga' : 'Gasto'}
                </span>
            </td>
            <td class="py-4 font-black text-sm">Bs. ${tx.amount.toLocaleString('es-VE')}</td>
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

function renderMonthlySummary(transactions) {
    const container = document.getElementById('monthly-summary');
    if (!container) return;

    const months = {};
    transactions.forEach(tx => {
        const m = new Date(tx.date).toLocaleString('es-VE', { month: 'long', year: 'numeric' });
        if (!months[m]) months[m] = { added: 0, balance: 0 };
        if (tx.type === 'ingreso') months[m].added += tx.amount;
        // Simple logic for monthly summary
    });

    container.innerHTML = Object.entries(months).map(([name, data]) => `
        <div class="p-4 bg-white/5 rounded-xl border border-white/5 flex justify-between items-center">
            <div>
                <p class="text-xs font-black capitalize text-slate-300">${name}</p>
                <p class="text-[10px] text-slate-500">Agregado: Bs. ${data.added.toLocaleString()}</p>
            </div>
            <i class="fas fa-chevron-right text-slate-700"></i>
        </div>
    `).join('');
}

// Modal Handlers
function openBackupModal() { document.getElementById('backup-modal').classList.remove('hidden'); }
function openSettings() { 
    const db = loadDB();
    document.getElementById('cfg-fee-load').value = db.settings.feeLoad;
    document.getElementById('cfg-fee-exit').value = db.settings.feeExit;
    document.getElementById('cfg-monthly-goal').value = db.settings.monthlyGoal;
    document.getElementById('settings-modal').classList.remove('hidden'); 
}
function closeModal(id) { document.getElementById(id).classList.add('hidden'); }

function saveSettings() {
    updateSettings({
        feeLoad: parseFloat(document.getElementById('cfg-fee-load').value),
        feeExit: parseFloat(document.getElementById('cfg-fee-exit').value),
        monthlyGoal: parseFloat(document.getElementById('cfg-monthly-goal').value)
    });
    closeModal('settings-modal');
    refreshUI();
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
