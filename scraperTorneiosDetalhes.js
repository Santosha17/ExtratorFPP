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
            body: JSON.stringify({
                morada: det.morada,
                juiz_arbitro: det.juiz,
                premio_monetario: det.premio,
                regulamento_url: det.regulamento,
                piso: det.piso,
                modalidade: det.modalidade,
                telefone: det.telefone,
                email: det.email,
                updated_at: new Date().toISOString()
            })
        });

        if (!res.ok) throw new Error(await res.text());
        console.log(`   ✅ Sucesso ao atualizar ${fpp_id}`);
    } catch (err) {
        console.error(`   ❌ Erro ao atualizar ${fpp_id}:`, err.message);
    }
}

(async () => {
    console.log("📥 A buscar torneios pendentes de atualização...");

    const response = await fetch(`${SUPABASE_URL}/rest/v1/torneios?morada=is.null`, {
        headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
    });
    const torneiosParaAtualizar = await response.json();

    if (torneiosParaAtualizar.length === 0) {
        console.log("🎉 Tudo atualizado! Nada para fazer.");
        return;
    }

    const browser = await puppeteer.launch({ headless: "new", args: ['--no-sandbox'] });
    const page = await browser.newPage();

    for (const torneio of torneiosParaAtualizar) {
        console.log(`🌍 A processar: ${torneio.nome}`);

        try {
            await page.goto(torneio.url_tiepadel, { waitUntil: 'networkidle2', timeout: 60000 });

            // 1. Clicar no botão 'Informação'
            await page.evaluate(() => {
                const btn = document.querySelector('#link_menu_info');
                if (btn) btn.click();
            });

            // 2. Esperar pelo carregamento (loader)
            await page.waitForSelector(".img_loading");
            await page.waitForFunction(() => document.querySelector(".img_loading").style.display === 'none', { timeout: 15000 });

            // 3. Extrair os dados todos
            const detalhes = await page.evaluate(() => {
                const getText = (id) => document.getElementById(id)?.innerText.trim() || null;
                const getAttr = (id, attr) => document.getElementById(id)?.getAttribute(attr) || null;

                return {
                    morada: document.querySelector('[id*="lbl_address"]')?.innerText || "N/A",
                    juiz: getText('lbl_info_details_header_referee'),
                    premio: getText('lbl_info_details_header_prize_money'),
                    regulamento: getAttr('link_info_details_header_factsheet', 'href'),
                    piso: getText('lbl_info_details_header_surface'),
                    modalidade: getText('lbl_info_details_header_sport'),
                    telefone: document.querySelector('[id*="lbl_phone"]')?.innerText || null,
                    email: document.querySelector('[id*="link_email"]')?.innerText || null
                };
            });

            // 4. Gravar no Supabase
            await updateTorneioDetalhes(torneio.fpp_id, detalhes);
            await new Promise(r => setTimeout(r, 2000));

        } catch (err) {
            console.error(`   ❌ Erro em ${torneio.nome}:`, err.message);
        }
    }

    await browser.close();
    console.log("🏁 Sincronização terminada!");
})();