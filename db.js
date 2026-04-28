const DB_KEY = 'Kontigo_Tracker_Data';

const initialDB = {
    transactions: [],
    settings: {
        feeLoad: 3.0,
        feeExit: 1.7,
        monthlyGoal: 5000,
        organizationId: '',
        apiKey: ''
    },
    manualKontigoVES: 0,
    manualKontigoUSD: 0,
    exchangeRate: 6000,
    lastUpdate: Date.now()
};

function loadDB() {
    const raw = localStorage.getItem(DB_KEY);
    if (!raw) {
        saveDB(initialDB);
        return initialDB;
    }
    try {
        const db = JSON.parse(raw);
        if (!db.transactions) db.transactions = [];
        if (!db.settings) db.settings = initialDB.settings;
        if (db.settings.organizationId === undefined) db.settings.organizationId = '';
        if (db.manualKontigoVES === undefined) db.manualKontigoVES = 0;
        if (db.manualKontigoUSD === undefined) db.manualKontigoUSD = 0;
        return db;
    } catch (e) {
        console.error("Error parsing DB", e);
        return initialDB;
    }
}

function saveDB(db) {
    db.lastUpdate = Date.now();
    localStorage.setItem(DB_KEY, JSON.stringify(db));
}

function addTransaction(tx) {
    const db = loadDB();
    tx.id = Date.now() + Math.floor(Math.random() * 1000);
    tx.date = tx.date || new Date().toISOString();
    
    // Store both VES and USD at the time of transaction
    const rate = tx.rate || db.exchangeRate || 6000;
    tx.usdAmount = tx.amount / rate;
    
    db.transactions.push(tx);
    saveDB(db);
    return tx;
}

function deleteTransaction(id) {
    const db = loadDB();
    db.transactions = db.transactions.filter(t => t.id !== id);
    saveDB(db);
}

function updateManualBalances(ves, usd) {
    const db = loadDB();
    db.manualKontigoVES = ves;
    db.manualKontigoUSD = usd || (ves / (db.exchangeRate || 1));
    saveDB(db);
}

function updateSettings(newSettings) {
    const db = loadDB();
    db.settings = { ...db.settings, ...newSettings };
    // Update USD balance if rate changed
    db.manualKontigoUSD = db.manualKontigoVES / (db.exchangeRate || 1);
    saveDB(db);
}

// Stats & Reporting
function calculateStats() {
    const db = loadDB();
    const stats = {
        totalAddedVES: 0,
        currentBankVES: 0,
        kontigoUSD: db.manualKontigoVES / (db.exchangeRate || 1),
        kontigoVES: db.manualKontigoVES,
        totalFeesVES: 0,
        historyPct: [] // Updated for percentage history
    };

    const sorted = [...db.transactions].sort((a, b) => new Date(a.date) - new Date(b.date));
    let runningAdded = 0;
    
    sorted.forEach(tx => {
        if (tx.type === 'ingreso') {
            stats.totalAddedVES += tx.amount;
            stats.currentBankVES += tx.amount;
            runningAdded += tx.amount;
        } else if (tx.type === 'gasto' || tx.type === 'retiro') {
            stats.currentBankVES -= tx.amount;
        } else if (tx.type === 'carga') {
            stats.currentBankVES -= tx.amount;
            // 3% standard fee calculation
            const feePercent = db.settings.feeLoad || 3.0;
            const fee = tx.amount * (feePercent / 100);
            stats.totalFeesVES += fee;
        }
        
        // Calculate theoretical progress or just track added for now
        // To make a percentage chart, we need a "Current Value" history.
        // Since we only have the final "Manual Balance", we'll use a simplified model
        // for history or just focus on the final ROI.
        // For the chart to be "percentage by days", we'll track (Final Manual Balance / Total Added) per day
        const pct = runningAdded > 0 ? ((db.manualKontigoVES / runningAdded) - 1) * 100 : 0;
        stats.historyPct.push({ date: tx.date.split('T')[0], pct: pct });
    });

    stats.diffVES = db.manualKontigoVES - stats.totalAddedVES;
    // Efficiency: (Current / Total Added - 1) * 100
    stats.efficiency = stats.totalAddedVES > 0 ? ((db.manualKontigoVES / stats.totalAddedVES) - 1) * 100 : 0;

    return stats;
}

function getPeriodReports() {
    const db = loadDB();
    const reports = {
        monthly: {},
        quarterly: {},
        annual: {}
    };

    db.transactions.forEach(tx => {
        const d = new Date(tx.date);
        const year = d.getFullYear();
        const month = d.getMonth();
        const quarter = Math.floor(month / 3) + 1;

        const mKey = `${year}-${String(month + 1).padStart(2, '0')}`;
        const qKey = `${year}-Q${quarter}`;
        const aKey = `${year}`;

        [mKey, qKey, aKey].forEach((key, idx) => {
            const type = idx === 0 ? 'monthly' : idx === 1 ? 'quarterly' : 'annual';
            if (!reports[type][key]) reports[type][key] = { ingresos: 0, cargas: 0, gastos: 0, retiros: 0 };
            
            if (tx.type === 'ingreso') reports[type][key].ingresos += tx.amount;
            else if (tx.type === 'carga') reports[type][key].cargas += tx.amount;
            else if (tx.type === 'gasto') reports[type][key].gastos += tx.amount;
            else if (tx.type === 'retiro') reports[type][key].retiros += tx.amount;
        });
    });

    return reports;
}
