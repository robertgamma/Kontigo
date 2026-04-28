const DB_KEY = 'Kontigo_Tracker_Data';

const initialDB = {
    transactions: [],
    settings: {
        feeLoad: 3.0,
        feeExit: 1.7,
        monthlyGoal: 5000,
        apiKey: ''
    },
    exchangeRate: 36.5, // Default/Sample rate
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
        // Ensure structure exists
        if (!db.transactions) db.transactions = [];
        if (!db.settings) db.settings = initialDB.settings;
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
    db.transactions.push(tx);
    saveDB(db);
    return tx;
}

function deleteTransaction(id) {
    const db = loadDB();
    db.transactions = db.transactions.filter(t => t.id !== id);
    saveDB(db);
}

function updateSettings(newSettings) {
    const db = loadDB();
    db.settings = { ...db.settings, ...newSettings };
    saveDB(db);
}

// Stats Calculation
function calculateStats() {
    const db = loadDB();
    const stats = {
        totalAddedVES: 0,
        currentBankVES: 0,
        kontigoUSD: 0,
        totalFeesVES: 0,
        historyUSD: [] // For charts
    };

    // Sort transactions by date
    const sorted = [...db.transactions].sort((a, b) => new Date(a.date) - new Date(b.date));

    let runningUSD = 0;
    
    sorted.forEach(tx => {
        if (tx.type === 'ingreso') {
            stats.totalAddedVES += tx.amount;
            stats.currentBankVES += tx.amount;
        } else if (tx.type === 'gasto') {
            stats.currentBankVES -= tx.amount;
        } else if (tx.type === 'carga') {
            stats.currentBankVES -= tx.amount;
            // Calculate fees
            const fee = tx.amount * (db.settings.feeLoad / 100);
            stats.totalFeesVES += fee;
            const netVES = tx.amount - fee;
            const rate = tx.rate || db.exchangeRate;
            const addedUSD = netVES / rate;
            runningUSD += addedUSD;
        }
        
        // Push state for history
        stats.historyUSD.push({
            date: tx.date.split('T')[0],
            usd: runningUSD
        });
    });

    stats.kontigoUSD = runningUSD;
    stats.diffVES = (stats.kontigoUSD * db.exchangeRate) - stats.totalAddedVES;
    stats.efficiency = stats.totalAddedVES > 0 ? (stats.kontigoUSD * db.exchangeRate / stats.totalAddedVES) * 100 : 0;

    return stats;
}
