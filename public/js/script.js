document.addEventListener('DOMContentLoaded', () => {
    // Inizializza il radar chart
    const ctx = document.getElementById('metricsChart')?.getContext('2d');
    let radarChart;

    if (ctx) {
        radarChart = new Chart(ctx, {
            type: 'radar',
            data: {
                labels: ['Utilità', 'Vanità', 'Engagement', 'Rilevanza Settoriale'],
                datasets: [{
                    label: 'Metriche del Post',
                    data: [
                        parseInt(document.getElementById('metric-utility')?.textContent) || 0,
                        parseInt(document.getElementById('metric-vanity')?.textContent) || 0,
                        parseInt(document.getElementById('metric-engagement')?.textContent) || 0,
                        parseInt(document.getElementById('metric-relevance')?.textContent) || 0
                    ],
                    backgroundColor: 'rgba(0, 119, 181, 0.2)',
                    borderColor: '#0077b5',
                    borderWidth: 2,
                    pointBackgroundColor: '#0077b5'
                }]
            },
            options: {
                scales: {
                    r: {
                        beginAtZero: true,
                        max: 100,
                        ticks: { stepSize: 20 }
                    }
                },
                plugins: {
                    legend: { display: false },
                    tooltip: { enabled: true }
                }
            }
        });
    }

    // Gestione del pulsante Analizza
    const analyzeBtn = document.getElementById('update-metrics');
    if (analyzeBtn) {
        analyzeBtn.addEventListener('click', async () => {
            const postId = analyzeBtn.getAttribute('data-post-id');
            const metricsLoading = document.getElementById('metrics-loading');
            const metricsContainer = document.getElementById('metrics');

            metricsLoading.textContent = 'Analisi in corso...';
            metricsLoading.classList.remove('alert-danger');
            metricsLoading.classList.add('alert-primary');
            metricsLoading.classList.remove('d-none');

            try {
                const response = await fetch(`/api/posts/analyze/${postId}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' }
                });
                const data = await response.json();
                if (response.ok && data.analysis) {
                    // Aggiorna le metriche
                    document.getElementById('metric-utility').textContent = data.analysis.utility;
                    document.getElementById('metric-vanity').textContent = data.analysis.vanity;
                    document.getElementById('metric-engagement').textContent = data.analysis.engagement;
                    document.getElementById('metric-sentiment').textContent = data.analysis.sentiment;
                    document.getElementById('metric-relevance').textContent = data.analysis.sector_relevance;

                    // Aggiorna l’analisi
                    const analysisText = `Il post mostra un'utilità ${data.analysis.utility >= 70 ? 'elevata' : data.analysis.utility >= 40 ? 'moderata' : 'bassa'} (${data.analysis.utility}/100) e un coinvolgimento ${data.analysis.engagement >= 70 ? 'alto' : data.analysis.engagement >= 40 ? 'medio' : 'basso'} (${data.analysis.engagement}/100). La vanità è ${data.analysis.vanity >= 70 ? 'elevata' : data.analysis.vanity >= 40 ? 'moderata' : 'bassa'} (${data.analysis.vanity}/100), mentre la rilevanza settoriale è ${data.analysis.sector_relevance >= 70 ? 'forte' : data.analysis.sector_relevance >= 40 ? 'media' : 'bassa'} (${data.analysis.sector_relevance}/100). Il sentiment è ${data.analysis.sentiment.toLowerCase()}.`;
                    document.getElementById('metrics-analysis').textContent = analysisText;

                    // Aggiorna il suggerimento
                    const suggestionText = data.analysis.engagement < 50 ? 'Aggiungi una call-to-action chiara o una domanda per stimolare l’interazione degli utenti.' :
                        data.analysis.utility < 50 ? 'Includi più informazioni utili o dati concreti per aumentare il valore del post.' :
                        data.analysis.vanity >= 70 ? 'Riduci il focus su promozioni personali per migliorare l’autenticità.' :
                        data.analysis.sector_relevance < 50 ? 'Allinea il contenuto a trend o argomenti rilevanti per il tuo settore.' :
                        'Continua a bilanciare utilità e coinvolgimento per mantenere l’efficacia.';
                    document.getElementById('metrics-suggestion').textContent = suggestionText;

                    // Aggiorna il radar chart
                    if (radarChart) {
                        radarChart.data.datasets[0].data = [
                            data.analysis.utility,
                            data.analysis.vanity,
                            data.analysis.engagement,
                            data.analysis.sector_relevance
                        ];
                        radarChart.update();
                    }

                    // Mostra le metriche
                    metricsContainer.classList.remove('d-none');
                    metricsLoading.classList.add('d-none');
                } else {
                    metricsLoading.textContent = 'Errore durante l\'analisi: ' + (data.error || 'Errore sconosciuto');
                    metricsLoading.classList.remove('alert-primary');
                    metricsLoading.classList.add('alert-danger');
                }
            } catch (err) {
                console.error('Error analyzing post:', err);
                metricsLoading.textContent = 'Errore di rete durante l\'analisi.';
                metricsLoading.classList.remove('alert-primary');
                metricsLoading.classList.add('alert-danger');
            }
        });
    }
});