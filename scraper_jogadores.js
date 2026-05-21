require('dotenv').config();
const puppeteer = require('puppeteer');

// Resolve o erro "fetch is not a function"
const fetch = globalThis.fetch || require('node-fetch');

// --- CONFIGURAÇÕES DO SUPABASE ---
const SUPABASE_URL = process.env.SUPABASE_URL_SN_LIGA;
const SUPABASE_KEY = process.env.SUPABASE_KEY_SN_LIGA;

// --- LISTA DE TORNEIOS ---
const TORNEIOS_LIGA = [
    { nome: "Zona 4B", tipo: "Absolutos", url: "https://fpp.tiepadel.com/Tournaments/LigaMudum2026FaseRegularAbsZona4B/Draws" },
];

const mapaEquipas = {};

// Função auxiliar para garantir que os links ficam sempre bem formatados
function formatarUrl(src) {
    if (!src) return null;
    if (src.startsWith('http')) return src;
    return src.startsWith('/') ? `https://fpp.tiepadel.com${src}` : `https://fpp.tiepadel.com/${src}`;
}

// 1. Carregar IDs das equipas
async function carregarEquipas() {
    console.log("📥 Mapeando IDs das equipas do Supabase...");
    try {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/equipas?select=id,nome,zona,tipo,categoria`, {
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': `Bearer ${SUPABASE_KEY}`,
                'Range': '0-2000'
            }
        });
        const dados = await res.json();
        if (!Array.isArray(dados)) throw new Error("Resposta da DB não é um array");

        dados.forEach(e => {
            const cat = e.categoria ? e.categoria.toLowerCase().trim() : 'sem-categoria';
            const chave = `${e.nome}|${e.zona}|${e.tipo}|${cat}`.toLowerCase().trim();
            mapaEquipas[chave] = e.id;
        });

        console.log(`✅ ${Object.keys(mapaEquipas).length} equipas em memória.`);
    } catch (err) {
        console.error("❌ Erro ao carregar equipas:", err.message);
    }
}

// 2. Enviar jogadores para o Supabase
async function upsertJogadores(plantel, idEquipaDB) {
    if (plantel.length === 0) return false;

    const jogadores = plantel.map(j => ({
        fpp_id: j.fpp_id,
        nome: j.nome,
        pontos_fpp: j.pontos_fpp,
        avatar_url: j.avatar_url,
        updated_at: j.updated_at
    }));

    const ligacoes = plantel.map(j => ({
        fpp_id: j.fpp_id,
        equipa_id: idEquipaDB,
        pontos_equipa: j.pontos_fpp
    }));

    try {
        const resJogadores = await fetch(`${SUPABASE_URL}/rest/v1/jogadores?on_conflict=fpp_id`, {
            method: 'POST',
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': `Bearer ${SUPABASE_KEY}`,
                'Content-Type': 'application/json',
                'Prefer': 'resolution=merge-duplicates'
            },
            body: JSON.stringify(jogadores)
        });

        if (!resJogadores.ok) throw new Error(await resJogadores.text());

        const resLigacoes = await fetch(`${SUPABASE_URL}/rest/v1/jogadores_equipas?on_conflict=fpp_id,equipa_id`, {
            method: 'POST',
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': `Bearer ${SUPABASE_KEY}`,
                'Content-Type': 'application/json',
                'Prefer': 'resolution=merge-duplicates'
            },
            body: JSON.stringify(ligacoes)
        });

        if (!resLigacoes.ok) {
            if (resLigacoes.status !== 409) throw new Error(await resLigacoes.text());
        }

        return true;
    } catch (err) {
        console.error("   ❌ Erro na Gravação DB:", err.message);
        return false;
    }
}

// --- MOTOR PRINCIPAL ---
(async () => {
    console.log("🚀 Iniciando Motor de Sincronização ScoreNacional...");
    await carregarEquipas();

    const browser = await puppeteer.launch({
        headless: "new",
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 1366, height: 768 });

    for (const torneio of TORNEIOS_LIGA) {
        console.log(`\n==================================================`);
        console.log(`🌍 ZONA: ${torneio.nome} | ${torneio.tipo}`);
        console.log(`==================================================`);

        try {
            await page.goto(torneio.url, { waitUntil: 'networkidle2', timeout: 60000 });

            const clicouEquipas = await page.evaluate(() => {
                const elements = Array.from(document.querySelectorAll('a, span, div.rtsLink'));
                const target = elements.find(el => el.innerText && el.innerText.trim().toUpperCase() === 'EQUIPAS');
                if (target) { target.click(); return true; }
                return false;
            });

            if (!clicouEquipas) continue;
            await new Promise(r => setTimeout(r, 4000));

            let temProximaPagina = true;
            let paginaAtual = 1;
            let memoriaEquipasPaginaAnterior = "";

            while (temProximaPagina) {
                console.log(`   📄 Página ${paginaAtual}...`);

                const linhasEquipas = await page.evaluate(() => {
                    const rows = Array.from(document.querySelectorAll('table[id*="grid_all_teams"] tbody tr'));
                    return rows.map(tr => {
                        const btn = tr.querySelector('a[mytitle="Ver Jogadores"]');
                        const seccaoTd = tr.querySelector('td:nth-child(2)');
                        const equipaTd = tr.querySelector('td:nth-child(3)');
                        return {
                            nomeEquipa: equipaTd ? equipaTd.innerText.trim() : null,
                            categoria: seccaoTd ? seccaoTd.innerText.trim() : null,
                            botaoId: btn ? btn.id : null
                        };
                    }).filter(e => e.botaoId && e.nomeEquipa);
                });

                if (linhasEquipas.length === 0) break;

                const hashDestaPagina = linhasEquipas.map(eq => eq.nomeEquipa).join('|');
                if (hashDestaPagina === memoriaEquipasPaginaAnterior) break;

                memoriaEquipasPaginaAnterior = hashDestaPagina;
                const primeiraEquipaAntes = linhasEquipas[0].nomeEquipa;

                for (const eq of linhasEquipas) {
                    const chaveProcurada = `${eq.nomeEquipa}|${torneio.nome}|${torneio.tipo}|${eq.categoria}`.toLowerCase().trim();
                    let idEquipaDB = mapaEquipas[chaveProcurada] || mapaEquipas[eq.nomeEquipa.toLowerCase().trim()];

                    if (!idEquipaDB) continue;

                    console.log(`   👥 Lendo plantel: ${eq.nomeEquipa}`);

                    await page.evaluate(() => {
                        document.querySelectorAll('table.rgMasterTable').forEach(t => {
                            if (t.innerText.toUpperCase().includes('LICEN')) t.remove();
                        });
                    });

                    await page.evaluate((id) => {
                        const btn = document.getElementById(id);
                        if (btn) btn.click();
                    }, eq.botaoId);

                    await new Promise(r => setTimeout(r, 5000));

                    // 1. Extrair os dados base
                    const plantelBase = await page.evaluate(() => {
                        const resultados = [];
                        const grids = Array.from(document.querySelectorAll('table.rgMasterTable'));

                        for (const table of grids) {
                            const ths = Array.from(table.querySelectorAll('th'));
                            if (ths.length === 0) continue;

                            let idxL = -1, idxN = -1, idxP = -1;
                            ths.forEach((th, index) => {
                                const text = th.innerText.toUpperCase().trim();
                                if (text.includes('LICEN')) idxL = index;
                                if (text === 'NOME' || text.includes('JOGADOR')) idxN = index;
                                if (text.includes('PONTOS')) idxP = index;
                            });

                            if (idxL === -1) idxL = 0;
                            if (idxN === -1) idxN = 1;

                            const rows = Array.from(table.querySelectorAll('tbody tr'));
                            for (const tr of rows) {
                                if (tr.classList.contains('rgHeader') || tr.classList.contains('rgPager')) continue;

                                const tds = tr.querySelectorAll('td');
                                if (tds.length > 2) {
                                    const licenca = tds[idxL]?.innerText.trim();
                                    const nomeTd = tds[idxN];
                                    const nome = nomeTd?.innerText.trim();

                                    const linkTag = nomeTd?.querySelector('a');
                                    const perfilAbsoluteUrl = linkTag ? linkTag.href : null;

                                    let pts = 0;
                                    if (idxP !== -1 && tds[idxP]) {
                                        pts = parseFloat(tds[idxP].innerText.trim().replace(/\./g, '').replace(',', '.')) || 0;
                                    }

                                    if (/^\d+$/.test(licenca) && nome && nome.toUpperCase() !== "JOGADOR") {
                                        resultados.push({
                                            nome,
                                            fpp_id: licenca,
                                            pontos_fpp: pts,
                                            perfilUrl: perfilAbsoluteUrl,
                                            updated_at: new Date().toISOString()
                                        });
                                    }
                                }
                            }
                        }
                        return resultados;
                    });

                    // 2. O Mergulho Profundo: Filtro Blindado (Sem GIFs nem Loaders)
                    const plantelComFotos = [];

                    if (plantelBase.length > 0) {
                        const photoPage = await browser.newPage();
                        await photoPage.setRequestInterception(true);
                        photoPage.on('request', (request) => {
                            if (request.resourceType() === 'stylesheet' || request.resourceType() === 'font') {
                                request.abort();
                            } else {
                                request.continue();
                            }
                        });

                        for (const j of plantelBase) {
                            let realPhotoUrl = null;

                            if (j.perfilUrl) {
                                try {
                                    process.stdout.write(`      📸 A procurar foto de ${j.nome}... `);

                                    // 🚀 ALTERAÇÃO AQUI: Esperar que a página acalme para o GIF do loading desaparecer
                                    await photoPage.goto(j.perfilUrl, { waitUntil: 'networkidle2', timeout: 15000 });

                                    const tempSrc = await photoPage.evaluate(() => {
                                        const imgs = Array.from(document.querySelectorAll('img'));
                                        let foundSrc = null;

                                        for (const img of imgs) {
                                            const src = img.getAttribute('src');
                                            if (!src) continue;

                                            const lower = src.toLowerCase();

                                            // 🚀 ALTERAÇÃO AQUI: Bloqueio agressivo de lixo e loaders
                                            if (lower.includes('flag') ||
                                                lower.includes('logo') ||
                                                lower.includes('icon') ||
                                                lower.includes('tars') ||
                                                lower.includes('loader') || // Adeus GIF de loading!
                                                lower.includes('.gif') ||   // Adeus qualquer GIF!
                                                lower.includes('nopicture')) {
                                                continue;
                                            }

                                            const width = img.getAttribute('width');
                                            if (width && parseInt(width) < 50) continue;

                                            foundSrc = src;
                                            break;
                                        }
                                        return foundSrc;
                                    });

                                    // 🚀 ALTERAÇÃO AQUI: Aplica a função que garante a barra (/) no link
                                    realPhotoUrl = formatarUrl(tempSrc);

                                    console.log(realPhotoUrl ? 'Encontrada!' : 'Sem foto real.');
                                } catch (e) {
                                    console.log(`Timeout ou erro.`);
                                }
                            }

                            plantelComFotos.push({
                                nome: j.nome,
                                fpp_id: j.fpp_id,
                                pontos_fpp: j.pontos_fpp,
                                avatar_url: realPhotoUrl,
                                updated_at: j.updated_at
                            });
                        }
                        await photoPage.close();
                    }

                    // 3. Gravar no Supabase
                    if (plantelComFotos.length > 0) {
                        await upsertJogadores(plantelComFotos, idEquipaDB);
                        const comFoto = plantelComFotos.filter(j => j.avatar_url).length;
                        console.log(`      ✅ Equipa gravada! (${comFoto} fotos salvas)\n`);
                    }
                }

                const clicou = await page.evaluate(() => {
                    const nextBtn = document.querySelector('input.rgPageNext');
                    if (nextBtn && !nextBtn.classList.contains('rgDisabled') && !nextBtn.disabled) {
                        nextBtn.click();
                        return true;
                    }
                    return false;
                });

                if (clicou) {
                    console.log("   🔄 A aguardar o carregamento da próxima página...");
                    try {
                        await page.waitForFunction(
                            (nomeAnterior) => {
                                const td = document.querySelector('table[id*="grid_all_teams"] tbody td:nth-child(3)');
                                return td && td.innerText.trim() !== nomeAnterior;
                            },
                            { timeout: 12000 },
                            primeiraEquipaAntes
                        );
                        paginaAtual++;
                        await new Promise(r => setTimeout(r, 2000));
                    } catch (e) {
                        temProximaPagina = false;
                    }
                } else {
                    temProximaPagina = false;
                }
            }
        } catch (err) {
            console.error(`   ❌ Erro na zona ${torneio.nome}:`, err.message);
        }
    }

    console.log("\n🏁 Sincronização Terminada!");
    await browser.close();
})();