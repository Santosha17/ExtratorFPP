require('dotenv').config();
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fetch = globalThis.fetch || require('node-fetch');

puppeteer.use(StealthPlugin());

const SUPABASE_URL = process.env.SUPABASE_URL_SN_LIGA;
const SUPABASE_KEY = process.env.SUPABASE_KEY_SN_LIGA;

// Vai buscar o "Esqueleto" que gravaste com o PDF
async function getTorneiosBD() {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/torneiosfpp?select=id,nome,clube_nome`, {
        headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
    });
    return await res.json();
}

// Atualiza apenas os campos vazios do torneio correto
async function updateTorneio(id, payload) {
    await fetch(`${SUPABASE_URL}/rest/v1/torneiosfpp?id=eq.${id}`, {
        method: 'PATCH',
        headers: {
            'apikey': SUPABASE_KEY,
            'Authorization': `Bearer ${SUPABASE_KEY}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
    });
}

// Função para ignorar diferenças de maiúsculas/hífenes
function formatarTexto(text) {
    return text.toLowerCase().replace(/[^a-z0-9]/g, '');
}

(async () => {
    console.log("🚀 A iniciar Fase 2: Enriquecimento de Clubes e Links...");

    const torneiosBD = await getTorneiosBD();
    console.log(`📚 Encontrados ${torneiosBD.length} torneios na tua Base de Dados.`);

    const browser = await puppeteer.launch({ headless: "new" });
    const page = await browser.newPage();

    await page.goto("https://tour.tiesports.com/fpp/calendar_(tournaments)", { waitUntil: 'networkidle2' });

    for (let mes = 1; mes <= 12; mes++) {
        console.log(`📅 A procurar clubes atribuídos no mês ${mes}...`);
        await page.select('select[id="drop_filter_tournaments_year"]', '2026');
        await page.select('select[id="drop_filter_tournaments_month"]', mes.toString());
        await page.click('#btn_filter_tournaments');

        await page.waitForFunction(() => !document.querySelector('.img_loading') || document.querySelector('.img_loading').style.display === 'none', { timeout: 15000 }).catch(()=>null);
        await new Promise(r => setTimeout(r, 1000)); // Esperar o render da tabela

        const dadosSite = await page.evaluate(() => {
            return Array.from(document.querySelectorAll('table.shop-table tbody tr')).map(tr => {
                const linkEl = tr.querySelector('.product__name a');
                // Apanha o clube no HTML listado a seguir ao ícone do marcador de mapa
                const clubeEl = tr.querySelector('.fa-map-marker-alt')?.nextElementSibling;
                if (!linkEl) return null;

                return {
                    nome: linkEl.innerText.trim(),
                    url_tiepadel: linkEl.href,
                    clube_nome: clubeEl ? clubeEl.innerText.trim() : null
                };
            }).filter(i => i && i.clube_nome); // Filtra os que já têm clube
        });

        let atualizados = 0;
        for (const tSite of dadosSite) {
            // Cruza o nome que está no Site com o nome que veio do PDF
            const matchBD = torneiosBD.find(tBD => {
                const n1 = formatarTexto(tBD.nome);
                const n2 = formatarTexto(tSite.nome);
                return n1.includes(n2) || n2.includes(n1); // Correspondência flexível
            });

            if (matchBD) {
                // Preenche o clube e o link na Base de Dados
                await updateTorneio(matchBD.id, {
                    clube_nome: tSite.clube_nome,
                    url_tiepadel: tSite.url_tiepadel,
                    updated_at: new Date().toISOString()
                });
                atualizados++;
            }
        }
        if(atualizados > 0) console.log(`✅ Atualizados ${atualizados} torneios com Clube e URL neste mês!`);
    }

    await browser.close();
    console.log("🏁 Fase 2 Terminada! A tua tabela já tem os clubes preenchidos.");
})();