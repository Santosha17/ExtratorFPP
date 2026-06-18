require('dotenv').config({ path: '../.env' });
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fetch = globalThis.fetch || require('node-fetch');

puppeteer.use(StealthPlugin());

const SUPABASE_URL = process.env.SUPABASE_URL_SN_LIGA;
const SUPABASE_KEY = process.env.SUPABASE_KEY_SN_LIGA;

const headersSupabase = {
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json',
    'Prefer': 'resolution=merge-duplicates, return=minimal' // Faz UPSERT usando a tua unique key fpp_id
};

(async () => {
    const ANO_ALVO = '2026'; // Podes mudar para '2025' para testar e encher a base de dados
    console.log(`🚀 A iniciar extração do calendário ${ANO_ALVO} via Puppeteer...`);

    const browser = await puppeteer.launch({ headless: true }); // Execução silenciosa
    const page = await browser.newPage();

    await page.goto("https://tour.tiesports.com/fpp/calendar_(tournaments)", { waitUntil: 'networkidle2' });

    // 1. Mudar o filtro para o Ano Alvo
    console.log(`   📅 A definir o ano para ${ANO_ALVO}...`);
    await page.select('select[name="drop_filter_tournaments_year"]', ANO_ALVO);
    await new Promise(r => setTimeout(r, 2500)); // Esperar que a página recarregue

    const torneiosMapeados = [];

    // 2. Loop pelos 12 meses
    for (let mes = 1; mes <= 12; mes++) {
        console.log(`   ⏳ A extrair torneios do mês ${mes}/${ANO_ALVO}...`);

        await page.select('select[name="drop_filter_tournaments_month"]', mes.toString());
        await page.click('input[name="btn_filter_tournaments"]');

        // Esperar que o UpdatePanel do ASP.NET carregue a tabela nova
        await new Promise(r => setTimeout(r, 3000));

        // 3. Extrair os dados da tabela diretamente do DOM do Browser
        const extraidosNoMes = await page.evaluate((ano) => {
            const results = [];

            document.querySelectorAll('table.shop-table tbody tr').forEach(tr => {
                const linkEl = tr.querySelector('a[id*="repeater_tournaments_link_"]');
                if (!linkEl) return;

                const nome = linkEl.innerText.trim();

                // 🛑 O TEU NOVO FILTRO AQUI: Ignorar Liga Mudum
                if (nome.toLowerCase().includes('liga mudum')) {
                    return; // Salta esta iteração e passa para o próximo torneio
                }

                const url_tiepadel = linkEl.href;
                const fpp_id = url_tiepadel.split('/')[4];

                // Função auxiliar para buscar os spans manhosos
                const getText = (selector) => {
                    const el = tr.querySelector(selector);
                    return el ? el.innerText.trim() : '';
                };

                results.push({
                    fpp_id: fpp_id,
                    nome: nome,
                    url_tiepadel: url_tiepadel,
                    classe: getText('span[id*="_lbl_section_"]'),
                    categorias: getText('span[id*="_lbl_pages_"]'),
                    data_corrida: getText('span[id*="_lbl_local_date_"]'),
                    clube_nome: getText('span[id*="_lbl_club_"]'),
                    inscritos_masculinos: parseInt(getText('span[id*="_lbl_count_male_"]')) || 0,
                    inscritos_femininos: parseInt(getText('span[id*="_lbl_count_female_"]')) || 0,
                    url_cartaz: tr.querySelector('img[id*="_img_cover_"]')?.src || '',
                    ano: parseInt(ano)
                });
            });

            return results;
        }, ANO_ALVO);

        // Guardar apenas os que ainda não foram apanhados (Ligas duram vários meses)
        for (const t of extraidosNoMes) {
            if (!torneiosMapeados.find(x => x.fpp_id === t.fpp_id)) {
                torneiosMapeados.push(t);
            }
        }

        console.log(`      ✔️ ${extraidosNoMes.length} torneios capturados neste mês.`);
    }

    await browser.close();
    console.log(`\n🎯 Fim da pesquisa! Total: ${torneiosMapeados.length} torneios únicos encontrados para ${ANO_ALVO}.`);

    // 4. Enviar em Bloco para o Supabase
    if (torneiosMapeados.length > 0) {
        console.log("💾 A sincronizar dados em bloco com o Supabase...");

        const resInsert = await fetch(`${SUPABASE_URL}/rest/v1/torneiosfpp?on_conflict=fpp_id`, {
            method: 'POST',
            headers: headersSupabase,
            body: JSON.stringify(torneiosMapeados)
        });

        if (resInsert.ok) {
            console.log("✅ Calendário enriquecido e guardado na perfeição!");
        } else {
            console.error("❌ Erro no Supabase:", await resInsert.text());
        }
    } else {
        console.log("⚠️ Nenhum torneio para gravar.");
    }
})();