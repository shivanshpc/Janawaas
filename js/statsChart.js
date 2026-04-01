(function(){
    function loadScript(src){
        return new Promise((res, rej)=>{
            const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = rej; document.head.appendChild(s);
        });
    }

    async function ensureChart() {
        if (typeof Chart === 'undefined') {
            await loadScript('https://cdn.jsdelivr.net/npm/chart.js');
        }
    }

    async function fetchOverview(){
        try {
            const url = (typeof API_URL !== 'undefined' ? API_URL : '') + '/stats/overview';
            const res = await fetch(url);
            if (!res.ok) return null;
            const data = await res.json();
            return data.overview || null;
        } catch(e){ return null; }
    }

    function ensureWrapperForCanvas(canvas){
        if (canvas.parentElement && canvas.parentElement.classList && canvas.parentElement.classList.contains('stats-chart')) return canvas;
        // create wrapper and move canvas into it
        const wrapper = document.createElement('div');
        wrapper.className = 'stats-chart';
        wrapper.style.height = '220px';
        canvas.parentElement.insertBefore(wrapper, canvas);
        wrapper.appendChild(canvas);
        return canvas;
    }

    function parseNumericValuesFromContainer(container){
        if (!container) return [0,0,0];
        const vals = Array.from(container.querySelectorAll('.value'))
            .map(el => parseInt(String(el.textContent||el.innerText).replace(/[^0-9]/g,'')) || 0)
            .filter(n => !isNaN(n));
        if (vals.length >= 3) return [vals[0]||0, vals[1]||0, vals[2]||0];
        if (vals.length > 0) return [vals[0]||0, vals[1]||0, vals[2]||0];
        return [0,0,0];
    }

    function setupCanvases(overview) {
        const canvases = Array.from(document.querySelectorAll('.sidebar-widget canvas, .stats-chart-canvas, #statsChart'));
        if (!canvases.length) return;

        canvases.forEach(canvas => {
            try {
                ensureWrapperForCanvas(canvas);
                const container = canvas.closest('.sidebar-widget');

                let values = [0,0,0];
                if (overview && (overview.resolvedIssues !== undefined || overview.inProgressIssues !== undefined || overview.pendingIssues !== undefined)) {
                    values = [overview.resolvedIssues||0, overview.inProgressIssues||0, overview.pendingIssues||0];
                } else {
                    values = parseNumericValuesFromContainer(container);
                }

                const ctx = canvas.getContext('2d');
                const labels = ['Resolved','In Progress','Pending'];
                const colors = ['#00ba7c','#ffad1f','#536471'];

                if (!canvas.__statsChart) {
                    canvas.__statsChart = new Chart(ctx, {
                        type: 'doughnut',
                        data: { labels: labels, datasets: [{ data: values, backgroundColor: colors, borderWidth: 0 }] },
                        options: { responsive:true, maintainAspectRatio:false, plugins:{legend:{position:'bottom', labels:{boxWidth:12}}}, cutout:'60%' }
                    });
                } else {
                    canvas.__statsChart.data.datasets[0].data = values;
                    canvas.__statsChart.update();
                }
            } catch (e) {
                console.error('statsChart init error', e);
            }
        });
    }

    async function init() {
        // register handler immediately so we don't miss DOMContentLoaded
        const handler = async () => {
            try {
                await ensureChart();
                const overview = await fetchOverview();
                setupCanvases(overview);
            } catch (e) {
                console.error('statsChart handler error', e);
            }
        };

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', handler);
        } else {
            // DOM already ready
            handler();
        }
    }

    init();
})();
