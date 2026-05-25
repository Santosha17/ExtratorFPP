require('dotenv').config();
const puppeteer = require('puppeteer');
const fetch = globalThis.fetch || require('node-fetch');

const SUPABASE_URL = process.env.SUPABASE_URL_SN_LIGA;
const SUPABASE_KEY = process.env.SUPABASE_KEY_SN_LIGA;
const URL_CALENDARIO = "https://tour.tiesports.com/fpp/calendar_(tournaments)";

function parseDateRange(dateStr) {
    if (!dateStr) return { data_inicio: null, data_fim: null };
    const months = {
        'jan': '01', 'fev': '02', 'mar': '03', 'abr': '04', 'mai': '05', 'jun': '06',
        'jul': '07', 'ago': '08', 'set': '09', 'out': '10', 'nov': '11', 'dez': '12',
        'janeiro': '01', 'fevereiro': '02', 'marco': '03', 'abril': '04', 'maio': '05',
        'junho': '06', 'julho': '07', 'agosto': '08', 'setembro': '09', 'outubro': '10',
        'novembro': '11', 'dezembro': '12'
    };
    const cleanStr = dateStr.toLowerCase().replace(' de ', ' ');
    const parts = cleanStr.split(/ - | a /);
    const lastPart = parts[parts.length - 1].trim().split(' ');
    const year = lastPart[lastPart.length - 1];
    const monthName = lastPart[lastPart.length - 2];
    const month = months[monthName?.substring(0, 3)] || '01';
    const dayStart = parts[0].trim().split(' ')[0].padStart(2, '0');
    const dayEnd = (parts.length > 1) ? parts[1].trim().split(' ')[0].padStart(2, '0') : dayStart;

    return { data_inicio: `${year}-${month}-${dayStart}`, data_fim: `${year}-${month}-${dayEnd}` };
}

async function upsertTorneios(payload) {
    const url = `${SUPABASE_URL}/rest/v1/torneiosfpp?on_conflict=fpp_id`;
    const headers = {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates'
    };

    const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(payload) });
    if (!res.ok) console.error(`❌ Erro DB:`, await res.text());
    else console.log(`✅ Sucesso na gravação: ${payload.fpp_id}`);
}

(async () => {
    console.log("🚀 Iniciando Motor de Sincronização...");
    const browser = await puppeteer.launch({ headless: "new" });
    const page = await browser.newPage();
    const listaTorneios = new Map();

    await page.goto(URL_CALENDARIO, { waitUntil: 'networkidle2' });

    // FASE 1
    for (let mes = 1; mes <= 12; mes++) {
        console.log(`📅 Mês ${mes}/2026`);
        await page.select('select[id="drop_filter_tournaments_year"]', '2026');
        await page.select('select[id="drop_filter_tournaments_month"]', mes.toString());
        await page.click('#btn_filter_tournaments');
        await page.waitForNetworkIdle({ idleTime: 1000, timeout: 30000 });

        const dados = await page.evaluate(() => {
            return Array.from(document.querySelectorAll('table.shop-table tbody tr')).map(tr => {
                const tds = tr.querySelectorAll('td');
                if (tds.length < 3) return null;
                const link = tds[2].querySelector('.product__name a');
                return link ? { fpp_id: link.href.split('/').pop(), url_tiepadel: link.href, nome: link.innerText.trim() } : null;
            }).filter(i => i);
        });
        dados.forEach(t => listaTorneios.set(t.fpp_id, t));
    }

    // FASE 2
    for (const t of Array.from(listaTorneios.values())) {
        try {
            await page.goto(t.url_tiepadel, { waitUntil: 'networkidle2', timeout: 60000 });
            await page.evaluate(() => document.querySelector('#link_menu_info')?.click());
            await page.waitForFunction(() => document.querySelector(".img_loading")?.style.display === 'none', { timeout: 10000 }).catch(() => {});

            const detalhes = await page.evaluate(() => {
                const getTxt = (sel) => document.querySelector(sel)?.innerText?.trim();

                // CORREÇÃO: Usamos nextElementSibling para saltar para o div com os dados
                const clubes = Array.from(document.querySelectorAll('h6'))
                    .filter(h => h.innerText.includes('Informação do Clube'))
                    .map(header => {
                        const container = header.nextElementSibling;
                        return container ? {
                            nome: container.querySelector('a[id*="_link_name"]')?.innerText.trim(),
                            morada: container.querySelector('span[id*="_lbl_address"]')?.innerText.trim(),
                            telefone: container.querySelector('span[id*="_lbl_phone"]')?.innerText.trim(),
                            email: container.querySelector('a[id*="_link_email"]')?.innerText.trim(),
                            web: container.querySelector('a[id*="_link_website"]')?.href
                        } : null;
                    }).filter(c => c !== null);

                return {
                    raw_date: getTxt('#lbl_info_details_header_dates'),
                    juiz_arbitro: getTxt('#lbl_info_details_header_referee'),
                    premio_monetario: getTxt('#lbl_info_details_header_prize_money'),
                    piso: getTxt('#lbl_info_details_header_surface'),
                    modalidade: getTxt('#lbl_info_details_header_sport'),
                    clubes_lista: JSON.stringify(clubes),
                    // Dados "plana" para o updateCoordenadas ler facilmente
                    clube_nome: clubes[0]?.nome || null,
                    clube_morada: clubes[0]?.morada || null
                };
            });

            const datas = parseDateRange(detalhes.raw_date);
            delete detalhes.raw_date;

            await upsertTorneios({
                fpp_id: t.fpp_id,
                nome: t.nome,
                ...detalhes,
                ...datas,
                updated_at: new Date().toISOString()
            });

        } catch (e) { console.error(`Erro: ${t.nome}`, e.message); }
    }
    await browser.close();
    console.log("🏁 Sincronização Terminada!");
})();