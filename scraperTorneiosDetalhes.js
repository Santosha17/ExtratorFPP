require('dotenv').config();
const puppeteer = require('puppeteer');
const fetch = globalThis.fetch || require('node-fetch');

const SUPABASE_URL = process.env.SUPABASE_URL_SN_LIGA;
const SUPABASE_KEY = process.env.SUPABASE_KEY_SN_LIGA;

async function updateTorneioDetalhes(fpp_id, det) {
    console.log(`💾 A gravar detalhes para ${fpp_id}...`);
    try {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/torneios?fpp_id=eq.${fpp_id}`, {
            method: 'PATCH',
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': `Bearer ${SUPABASE_KEY}`,
                'Content-Type': 'application/json',
                'Prefer': 'return=representation'
            },
            body: JSON.stringify(det)
        });

        if (!res.ok) throw new Error(await res.text());
        console.log(`   ✅ Sucesso ao atualizar ${fpp_id}`);
    } catch (err) {
        console.error(`   ❌ Erro ao atualizar ${fpp_id}:`, err.message);
    }
}

(async () => {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/torneios?clube_nome=is.null`, {
        headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
    });
    const torneiosParaAtualizar = await response.json();

    if (torneiosParaAtualizar.length === 0) return console.log("🎉 Tudo atualizado!");

    const browser = await puppeteer.launch({ headless: "new", args: ['--no-sandbox'] });
    const page = await browser.newPage();

    for (const torneio of torneiosParaAtualizar) {
        try {
            await page.goto(torneio.url_tiepadel, { waitUntil: 'networkidle2', timeout: 60000 });
            await page.evaluate(() => document.querySelector('#link_menu_info')?.click());
            await page.waitForFunction(() => document.querySelector(".img_loading")?.style.display === 'none', { timeout: 15000 });

            const data = await page.evaluate(() => {
                const getTxt = (selector) => document.querySelector(selector)?.innerText?.trim() || null;

                // Extração dos Quadros (Tabela)
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
                    // Detalhes Gerais
                    juiz_arbitro: getTxt('#lbl_info_details_header_referee'),
                    premio_monetario: getTxt('#lbl_info_details_header_prize_money'),
                    regulamento_url: document.querySelector('#link_info_details_header_factsheet')?.getAttribute('href'),
                    piso: getTxt('#lbl_info_details_header_surface'),
                    modalidade: getTxt('#lbl_info_details_header_sport'),

                    // Clube
                    clube_nome: getTxt('#lbl_club_name'),
                    clube_morada: getTxt('#lbl_club_address'),
                    clube_telefone: getTxt('#lbl_club_phone'),
                    clube_email: getTxt('#lbl_club_email'),

                    // Organizador
                    organizador_nome: getTxt('#lbl_organizer_name'),
                    organizador_morada: getTxt('#lbl_organizer_address'),
                    organizador_telefone: getTxt('#lbl_organizer_phone'),
                    organizador_email: getTxt('#lbl_organizer_email'),

                    quadros_data: quadros,
                    updated_at: new Date().toISOString()
                };
            });

            await updateTorneioDetalhes(torneio.fpp_id, data);
            await new Promise(r => setTimeout(r, 2000));
        } catch (err) {
            console.error(`❌ Erro ${torneio.nome}:`, err.message);
        }
    }
    await browser.close();
})();