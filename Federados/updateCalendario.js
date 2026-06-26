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

        // Capturamos o HTML atual da tabela para saber quando foi atualizada
        const previousHtml = await page.evaluate(() => document.querySelector('table.shop-table tbody')?.innerHTML || '');

        await page.select('select[name="drop_filter_tournaments_month"]', mes.toString());
        
        // Faz o clique e espera ao mesmo tempo pelo pedido AJAX para não haver race conditions
        const waitResponse = page.waitForResponse(res => res.url().includes('calendar') && res.status() === 200, { timeout: 15000 }).catch(() => null);
        await page.evaluate(() => document.querySelector('input[name="btn_filter_tournaments"]').click());
        await waitResponse;

        // Adicionalmente, esperamos até que o HTML da tabela mude (ou dê timeout de 5 segs)
        await page.waitForFunction(
            (prev) => {
                const current = document.querySelector('table.shop-table tbody')?.innerHTML || '';
                return current !== prev;
            },
            { timeout: 5000 },
            previousHtml
        ).catch(() => console.log("   ⚠️ Tabela não mudou visualmente ou demorou demasiado, a prosseguir..."));

        // Mais um bocadinho para a renderização final do browser
        await new Promise(r => setTimeout(r, 500));

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

    // 4. Enviar em Bloco para o Supabase com Reconciliação
    if (torneiosMapeados.length > 0) {
        console.log("📥 A obter torneios planeados (PDF) do Supabase para reconciliação...");
        let dbTournaments = [];
        try {
            const resDb = await fetch(`${SUPABASE_URL}/rest/v1/torneiosfpp?select=fpp_id,nome,data_inicio`, { headers: headersSupabase });
            if (resDb.ok) dbTournaments = await resDb.json();
        } catch (e) {
            console.error("⚠️ Falha ao obter base de dados. Vai avançar sem reconciliação.");
        }

        // Helpers de Reconciliação
        const cleanStr = s => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9\s]/g, "");
        const getMesStr = m => {
            if (!m) return null;
            m = m.toLowerCase();
            if (m.includes('jan')) return 1; if (m.includes('fev')) return 2; if (m.includes('mar')) return 3;
            if (m.includes('abr')) return 4; if (m.includes('mai')) return 5; if (m.includes('jun')) return 6;
            if (m.includes('jul')) return 7; if (m.includes('ago')) return 8; if (m.includes('set')) return 9;
            if (m.includes('out')) return 10; if (m.includes('nov')) return 11; if (m.includes('dez')) return 12;
            return null;
        };

        const reconciliados = [];
        let reconciliacoesCount = 0;

        for (const t of torneiosMapeados) {
            const mesScraped = getMesStr(t.data_corrida);
            let matchEncontrado = null;
            let matchIndex = -1;

            if (mesScraped && dbTournaments.length > 0) {
                for (let i = 0; i < dbTournaments.length; i++) {
                    const dbT = dbTournaments[i];
                    if (!dbT.data_inicio) continue;
                    const dbMes = parseInt(dbT.data_inicio.split('-')[1]);
                    
                    if (dbMes === mesScraped) {
                        const strDb = cleanStr(dbT.nome);
                        const strScraped = cleanStr(t.nome);

                        // 1. Casamento Exato (100% igual ignorando acentos/maiúsculas)
                        if (strDb === strScraped) {
                            matchEncontrado = dbT;
                            matchIndex = i;
                            break;
                        }

                        // 2. Casamento 100% Exato por Palavras Específicas
                        const genericWords = ['de', 'do', 'da', 'padel', 'open', 'torneio', 'campeonato', 'fpp', 'fip', 'clube'];
                        const dbWords = strDb.split(/\s+/).filter(w => w.length >= 3 && !genericWords.includes(w));
                        const scrapedWords = strScraped.split(/\s+/).filter(w => w.length >= 3 && !genericWords.includes(w));
                        
                        if (dbWords.length > 0 && scrapedWords.length > 0) {
                            let overlaps = 0;
                            for (const sw of scrapedWords) {
                                if (dbWords.includes(sw)) overlaps++;
                            }

                            const isMatch100 = (overlaps === dbWords.length) && (overlaps === scrapedWords.length);
                            if (isMatch100) {
                                matchEncontrado = dbT;
                                matchIndex = i;
                                break;
                            }
                        }
                    }
                }
            }

            if (matchEncontrado) {
                t.fpp_id = matchEncontrado.fpp_id; 
                // Restaurar o nome oficial do PDF! O tieSports costuma ter erros (ex: "º Open" em vez de "2º Open")
                t.nome = matchEncontrado.nome; 
                reconciliacoesCount++;
                // 🛑 O TRUQUE: Remover este torneio da pool para não ser "casado" com outro!
                // Assim garantimos matches 1-para-1 e evitamos o erro "cannot affect row a second time"
                dbTournaments.splice(matchIndex, 1);
            }
            
            // Garantir que não empurramos duplicados que já existissem por erro de lógica prévia
            if (!reconciliados.find(r => r.fpp_id === t.fpp_id)) {
                reconciliados.push(t);
            }
        }

        console.log(`🔗 Casamentos Inteligentes (Fuzzy Match): ${reconciliacoesCount} torneios ligados com sucesso ao plano do PDF.`);
        console.log("💾 A sincronizar dados em bloco com o Supabase...");

        const resInsert = await fetch(`${SUPABASE_URL}/rest/v1/torneiosfpp?on_conflict=fpp_id`, {
            method: 'POST',
            headers: headersSupabase,
            body: JSON.stringify(reconciliados)
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