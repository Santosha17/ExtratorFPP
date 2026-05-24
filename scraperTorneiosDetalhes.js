require('dotenv').config();
const puppeteer = require('puppeteer');
const fetch = globalThis.fetch || require('node-fetch');

const SUPABASE_URL = process.env.SUPABASE_URL_SN_LIGA;
const SUPABASE_KEY = process.env.SUPABASE_KEY_SN_LIGA;

// Função para converter strings de data (ex: "14 - 17 Maio 2026") para formato ISO (YYYY-MM-DD)
function parseDateRange(dateStr) {
    if (!dateStr) return { data_inicio: null, data_fim: null };

    const months = {
        'janeiro': '01', 'fevereiro': '02', 'março': '03', 'marco': '03',
        'abril': '04', 'maio': '05', 'junho': '06', 'julho': '07',
        'agosto': '08', 'setembro': '09', 'outubro': '10', 'novembro': '11', 'dezembro': '12'
    };

    const cleanStr = dateStr.toLowerCase().replace(' de ', ' ');
    const parts = cleanStr.split(' ');

    let year, month, startDay, endDay;

    if (cleanStr.includes('-')) {
        startDay = parts[0].padStart(2, '0');
        endDay = parts[2].padStart(2, '0');
        month = months[parts[3]];
        year = parts[4];
    } else {
        startDay = parts[0].padStart(2, '0');
        endDay = parts[0].padStart(2, '0');
        month = months[parts[1]];
        year = parts[2];
    }

    return {
        data_inicio: `${year}-${month}-${startDay}`,
        data_fim: `${year}-${month}-${endDay}`
    };
}

async function updateTorneioDetalhes(fpp_id, det) {
    console.log(`💾 A gravar detalhes para ${fpp_id}...`);
    try {
        // Processar datas antes de enviar
        const { data_inicio, data_fim } = parseDateRange(det.raw_date);

        const payload = {
            ...det,
            data_inicio,
            data_fim,
            updated_at: new Date().toISOString()
        };
        delete payload.raw_date;

        const res = await fetch(`${SUPABASE_URL}/rest/v1/torneios?fpp_id=eq.${fpp_id}`, {
            method: 'PATCH',
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': `Bearer ${SUPABASE_KEY}`,
                'Content-Type': 'application/json',
                'Prefer': 'return=representation'
            },
            body: JSON.stringify(payload)
        });

        if (!res.ok) throw new Error(await res.text());
        console.log(`   ✅ Sucesso ao atualizar ${fpp_id}`);
    } catch (err) {
        console.error(`   ❌ Erro ao atualizar ${fpp_id}:`, err.message);
    }
}

(async () => {
    console.log("📥 A buscar torneios pendentes...");

    // Procura torneios onde clube_nome ainda é nulo (para não re-processar tudo)
    const response = await fetch(`${SUPABASE_URL}/rest/v1/torneios?clube_nome=is.null`, {
        headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
    });
    const torneiosParaAtualizar = await response.json();

    if (torneiosParaAtualizar.length === 0) return console.log("🎉 Tudo atualizado!");

    const browser = await puppeteer.launch({ headless: "new", args: ['--no-sandbox'] });
    const page = await browser.newPage();

    for (const torneio of torneiosParaAtualizar) {
        console.log(`🌍 A processar: ${torneio.nome}`);
        try {
            await page.goto(torneio.url_tiepadel, { waitUntil: 'networkidle2', timeout: 60000 });
            await page.evaluate(() => document.querySelector('#link_menu_info')?.click());
            await page.waitForFunction(() => document.querySelector(".img_loading")?.style.display === 'none', { timeout: 15000 });

            const data = await page.evaluate(() => {
                const getTxt = (selector) => document.querySelector(selector)?.innerText?.trim() || null;

                const quadros = [];
                document.querySelectorAll('table tr').forEach(row => {
                    const cols = row.querySelectorAll('td');
                    if (cols.length >= 3) {
                        quadros.push({
                            categoria: cols[0]?.innerText.trim(),
                            insc_ate: cols[1]?.innerText.trim(),
                            pag_ate: cols[2]?.innerText.trim()
                        });
                    }
                });

                return {
                    raw_date: getTxt('#lbl_info_details_header_date'),
                    juiz_arbitro: getTxt('#lbl_info_details_header_referee'),
                    premio_monetario: getTxt('#lbl_info_details_header_prize_money'),
                    regulamento_url: document.querySelector('#link_info_details_header_factsheet')?.getAttribute('href'),
                    piso: getTxt('#lbl_info_details_header_surface'),
                    modalidade: getTxt('#lbl_info_details_header_sport'),

                    clube_nome: getTxt('#lbl_club_name'),
                    clube_morada: getTxt('#lbl_club_address'),
                    clube_telefone: getTxt('#lbl_club_phone'),
                    clube_email: getTxt('#lbl_club_email'),

                    organizador_nome: getTxt('#lbl_organizer_name'),
                    organizador_morada: getTxt('#lbl_organizer_address'),
                    organizador_telefone: getTxt('#lbl_organizer_phone'),
                    organizador_email: getTxt('#lbl_organizer_email'),

                    quadros_data: quadros,
                    data_limite: quadros.length > 0 ? quadros[0].insc_ate : null
                };
            });

            await updateTorneioDetalhes(torneio.fpp_id, data);
            await new Promise(r => setTimeout(r, 2000));
        } catch (err) {
            console.error(`❌ Erro ${torneio.nome}:`, err.message);
        }
    }
    await browser.close();
    console.log("🏁 Sincronização terminada!");
})();