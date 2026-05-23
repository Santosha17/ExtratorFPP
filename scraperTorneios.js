require('dotenv').config();
const puppeteer = require('puppeteer');
const fetch = globalThis.fetch || require('node-fetch');

const SUPABASE_URL = process.env.SUPABASE_URL_SN_LIGA;
const SUPABASE_KEY = process.env.SUPABASE_KEY_SN_LIGA;
const URL_CALENDARIO = "https://tour.tiesports.com/fpp/calendar_(tournaments)";

// Função para converter data do site para formato YYYY-MM-DD
function parseDateRange(dateStr) {
    const months = {
        "jan": "01", "fev": "02", "mar": "03", "abr": "04", "mai": "05", "jun": "06",
        "jul": "07", "ago": "08", "set": "09", "out": "10", "nov": "11", "dez": "12"
    };

    const currentYear = new Date().getFullYear();
    const cleanStr = dateStr.toLowerCase().replace(/[^a-z0-9 -]/g, '');
    const parts = cleanStr.split('-');

    const toDate = (str) => {
        const words = str.trim().split(' '); // ex: ["13", "mar"]
        if (words.length < 2) return null;
        const day = words[0].padStart(2, '0');
        const month = months[words[1].substring(0, 3)] || "01";
        return `${currentYear}-${month}-${day}`;
    };

    return {
        inicio: toDate(parts[0]),
        fim: parts.length > 1 ? toDate(parts[1]) : toDate(parts[0])
    };
}

async function upsertTorneios(torneios) {
    if (torneios.length === 0) return false;
    console.log(`💾 A gravar ${torneios.length} torneios...`);

    try {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/torneios?on_conflict=fpp_id`, {
            method: 'POST',
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': `Bearer ${SUPABASE_KEY}`,
                'Content-Type': 'application/json',
                'Prefer': 'resolution=merge-duplicates'
            },
            body: JSON.stringify(torneios)
        });
        if (!res.ok) throw new Error(await res.text());
        return true;
    } catch (err) {
        console.error("   ❌ Erro na Gravação DB:", err.message);
        return false;
    }
}

(async () => {
    console.log("🚀 Iniciando Motor de Sincronização...");
    const browser = await puppeteer.launch({ headless: "new" });
    const page = await browser.newPage();
    await page.setViewport({ width: 1366, height: 768 });

    try {
        await page.goto(URL_CALENDARIO, { waitUntil: 'networkidle2', timeout: 60000 });
        console.log("   📄 A ler tabela...");

        const torneiosExtraidos = await page.evaluate(() => {
            const resultados = [];
            const rows = Array.from(document.querySelectorAll('table.shop-table tbody tr'));

            rows.forEach(tr => {
                const tds = tr.querySelectorAll('td');
                if (tds.length < 3) return;

                const linkObj = tds[2].querySelector('.product__name a');
                if (!linkObj) return;

                const maleText = tr.querySelector('[id*="lbl_count_male"]')?.innerText || "0";
                const femaleText = tr.querySelector('[id*="lbl_count_female"]')?.innerText || "0";

                // Pegamos a string da data que está visível na tabela
                const dateRaw = tds[2].querySelector('.fa-calendar-alt')?.nextElementSibling?.innerText || "";

                resultados.push({
                    fpp_id: linkObj.href.split('/').pop(),
                    nome: linkObj.innerText.trim(),
                    clube: tds[2].querySelector('.fa-map-marker-alt')?.nextElementSibling?.innerText || "N/A",
                    tipo: tds[1].innerText.trim(),
                    total_masculinos: parseInt(maleText.replace('-','0')),
                    total_femininos: parseInt(femaleText.replace('-','0')),
                    _data_raw: dateRaw, // Vamos processar isto fora do evaluate
                    url_tiepadel: linkObj.href,
                    status: "Importado",
                    updated_at: new Date().toISOString()
                });
            });
            return resultados;
        });

        // Processar datas antes de gravar
        const finalData = torneiosExtraidos.map(t => {
            const datas = parseDateRange(t._data_raw);
            delete t._data_raw; // Removemos a string crua
            return { ...t, data_inicio: datas.inicio, data_fim: datas.fim };
        });

        if (finalData.length > 0) {
            await upsertTorneios(finalData);
        }

    } catch (err) {
        console.error(`   ❌ Erro:`, err.message);
    }

    await browser.close();
    console.log("🏁 Processo encerrado.");
})();