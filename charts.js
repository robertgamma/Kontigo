let growthChart, variationChart;

function initCharts() {
    const ctxGrowth = document.getElementById('growthChart')?.getContext('2d');
    const ctxVariation = document.getElementById('variationChart')?.getContext('2d');

    if (ctxGrowth) {
        growthChart = new Chart(ctxGrowth, {
            type: 'line',
            data: {
                labels: [],
                datasets: [{
                    label: 'Balance Kontigo (USD)',
                    data: [],
                    borderColor: '#3b82f6',
                    backgroundColor: 'rgba(59, 130, 246, 0.1)',
                    fill: true,
                    tension: 0.4,
                    borderWidth: 3,
                    pointRadius: 4,
                    pointBackgroundColor: '#3b82f6'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        mode: 'index',
                        intersect: false,
                        backgroundColor: 'rgba(15, 23, 42, 0.9)',
                        titleFont: { family: 'Outfit', weight: 'bold' },
                        bodyFont: { family: 'Outfit' }
                    }
                },
                scales: {
                    x: { grid: { display: false }, ticks: { color: '#64748b', font: { size: 10 } } },
                    y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#64748b', font: { size: 10 } } }
                }
            }
        });
    }

    if (ctxVariation) {
        variationChart = new Chart(ctxVariation, {
            type: 'bar',
            data: {
                labels: [],
                datasets: [{
                    label: 'Var %',
                    data: [],
                    backgroundColor: (ctx) => {
                        const val = ctx.raw;
                        return val >= 0 ? 'rgba(16, 185, 129, 0.5)' : 'rgba(239, 68, 68, 0.5)';
                    },
                    borderRadius: 5
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false }
                },
                scales: {
                    x: { grid: { display: false }, ticks: { display: false } },
                    y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#64748b' } }
                }
            }
        });
    }
}

function updateCharts(history) {
    if (!growthChart || !variationChart) return;

    // Process growth data
    // Group by day to avoid clutter
    const dailyData = {};
    history.forEach(h => {
        dailyData[h.date] = h.usd;
    });

    const labels = Object.keys(dailyData).sort();
    const data = labels.map(l => dailyData[l]);

    growthChart.data.labels = labels;
    growthChart.data.datasets[0].data = data;
    growthChart.update();

    // Process variation data
    const variations = [];
    for (let i = 1; i < data.length; i++) {
        const prev = data[i-1];
        const curr = data[i];
        const varPct = prev > 0 ? ((curr - prev) / prev) * 100 : 0;
        variations.push(varPct);
    }

    variationChart.data.labels = labels.slice(1);
    variationChart.data.datasets[0].data = variations;
    variationChart.update();
}
