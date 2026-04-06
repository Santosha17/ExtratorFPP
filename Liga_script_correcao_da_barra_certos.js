const puppeteer = require('puppeteer');
const fs = require('fs');

// --- CONFIGURAÇÕES DO SUPABASE ---
const SUPABASE_URL = "https://eezbrdjncjjgmjueftgg.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVlemJyZGpuY2pqZ21qdWVmdGdnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTEzNzEyMywiZXhwIjoyMDkwNzEzMTIzfQ.KDGRw0MClRKxYUyOMiglb8VYGn8uHii79i-3hYkAWlc";
// ---------------------------------

const TORNEIOS_LIGA = [
    { nome: "Zona 1A", tipo: "Absolutos", url: "https://fpp.tiepadel.com/Tournaments/b996ef02-a837-48b5-a7d3-3f86077fb585/Draws" },
    { nome: "Zona 1A", tipo: "Veteranos", url: "https://fpp.tiepadel.com/Tournaments/71d3b007-c015-46b7-90de-181bc5e7f45d/Draws" },
    { nome: "Zona 1B", tipo: "Absolutos", url: "https://fpp.tiepadel.com/Tournaments/c55f6966-2a0a-45db-891d-0e380ff79879/Draws" },
    { nome: "Zona 1B", tipo: "Veteranos", url: "https://fpp.tiepadel.com/Tournaments/4bfee2ef-879a-4fd7-a0aa-af46e9d44485/Draws" },
    { nome: "Zona 1C", tipo: "Absolutos", url: "https://fpp.tiepadel.com/Tournaments/d7229a65-03ae-4b89-969a-ae104736139b/Draws" },
    { nome: "Zona 1C", tipo: "Veteranos", url: "https://fpp.tiepadel.com/Tournaments/40f779ef-fa5c-4c3a-919e-961f2ee17048/Draws" },
    { nome: "Zona 2", tipo: "Absolutos", url: "https://fpp.tiepadel.com/Tournaments/b028a5c4-fa22-4b1a-af5f-ef38d675bc7d/Draws" },
    { nome: "Zona 2", tipo: "Veteranos", url: "https://fpp.tiepadel.com/Tournaments/dbf74418-49f7-48c8-8e23-546f6d4b2aee/Draws" },
    { nome: "Zona 3A", tipo: "Absolutos", url: "https://fpp.tiepadel.com/Tournaments/51ab7f23-a435-47c6-b0e3-16839d3585d7/Draws" },
    { nome: "Zona 3A", tipo: "Veteranos", url: "https://fpp.tiepadel.com/Tournaments/36c21e4e-c3e1-4f67-9fea-53cf9fb7e72e/Draws" },
    { nome: "Zona 3B", tipo: "Absolutos", url: "https://fpp.tiepadel.com/Tournaments/LigaMudum2026FaseRegularAbsZona3B/Draws" },
    { nome: "Zona 3B", tipo: "Veteranos", url: "https://fpp.tiepadel.com/Tournaments/87d6ab8b-3fa6-4b80-8692-fd527afd1da3/Draws" },
    { nome: "Zona 3C", tipo: "Absolutos", url: "https://fpp.tiepadel.com/Tournaments/f642cf7e-c5f3-43c6-bc4e-b86c67f14374/Draws" },
    { nome: "Zona 3C", tipo: "Veteranos", url: "https://fpp.tiepadel.com/Tournaments/bd75b6b0-f5b7-4852-b65f-499646e07c9c/Draws" },
    { nome: "Zona 3D", tipo: "Absolutos", url: "https://fpp.tiepadel.com/Tournaments/7e0cc576-24ab-4ea4-9090-c496970ce8bc/Draws" },
    { nome: "Zona 3D", tipo: "Veteranos", url: "https://fpp.tiepadel.com/Tournaments/feace55d-c56c-4853-9249-aadedba5f923/Draws" },
    { nome: "Zona 4A", tipo: "Absolutos", url: "https://fpp.tiepadel.com/Tournaments/LigaMudum2026FaseRegularAbsZona4A/Draws" },
    { nome: "Zona 4A", tipo: "Veteranos", url: "https://fpp.tiepadel.com/Tournaments/06d421b9-6fd7-4b5c-a1f0-4b619cef170b/Draws" },
    { nome: "Zona 4B", tipo: "Absolutos", url: "https://fpp.tiepadel.com/Tournaments/LigaMudum2026FaseRegularAbsZona4B/Draws" },
    { nome: "Zona 4B", tipo: "Veteranos", url: "https://fpp.tiepadel.com/Tournaments/f0eea46a-dec7-4bbe-8051-b11565a7a6fc/Draws" },
    { nome: "Zona 4C", tipo: "Absolutos", url: "https://fpp.tiepadel.com/Tournaments/LigaMudum2026FaseRegularAbsZona4C/Draws" },
    { nome: "Zona 4C", tipo: "Veteranos", url: "https://fpp.tiepadel.com/Tournaments/LigaMudum2026FaseRegularVetZona4C/Draws" },
    { nome: "Zona 4D", tipo: "Absolutos", url: "https://fpp.tiepadel.com/Tournaments/LigaMudum2026FaseRegularAbsZona4D/Draws" },
    { nome: "Zona 4D", tipo: "Veteranos", url: "https://fpp.tiepadel.com/Tournaments/6ca9340a-e4ff-459d-ba60-44439acf98f9/Draws" },
    { nome: "Zona 5", tipo: "Absolutos", url: "https://fpp.tiepadel.com/Tournaments/LigaMudum2026FaseRegularAbsZona5/Draws" },
    { nome: "Zona 5", tipo: "Veteranos", url: "https://fpp.tiepadel.com/Tournaments/67abb21b-fa70-499a-bb3b-74c51f2f59a3/Draws" },
    { nome: "Zona 6A", tipo: "Absolutos", url: "https://fpp.tiepadel.com/Tournaments/LigaMudum2026FaseRegularAbsZona6A/Draws" },
    { nome: "Zona 6A", tipo: "Veteranos", url: "https://fpp.tiepadel.com/Tournaments/LigaMudum2026FaseRegularVetZona6A/Draws" },
    { nome: "Zona 6B", tipo: "Absolutos", url: "https://fpp.tiepadel.com/Tournaments/LigaMudum2026FaseRegularAbsZona6B/Draws" },
    { nome: "Zona 6B", tipo: "Veteranos", url: "https://fpp.tiepadel.com/Tournaments/LigaMudum2026FaseRegularVetZona6B/Draws" },
    { nome: "Zona 7A", tipo: "Absolutos", url: "https://fpp.tiepadel.com/Tournaments/LigaMudum2026FaseRegularAbsZona7A/Draws" },
    { nome: "Zona 7A", tipo: "Veteranos", url: "https://fpp.tiepadel.com/Tournaments/2af4cd70-9fde-4d3f-8c50-83637799aa3d/Draws" },
    { nome: "Zona 7B", tipo: "Absolutos", url: "https://fpp.tiepadel.com/Tournaments/LigaMudum2026FaseRegularAbsZona7B/Draws" },
    { nome: "Zona 7B", tipo: "Veteranos", url: "https://fpp.tiepadel.com/Tournaments/4f14c7fc-3318-4ba6-84d0-dc5417d4d9d4/Draws" },
    { nome: "Zona 8A", tipo: "Absolutos", url: "https://fpp.tiepadel.com/Tournaments/LigaMudum2026FaseRegularAbsZona8A/Draws" },
    { nome: "Zona 8A", tipo: "Veteranos", url: "https://fpp.tiepadel.com/Tournaments/LigaMudum2026FaseRegularVetZona8A/Draws" },
    { nome: "Zona 8B", tipo: "Absolutos", url: "https://fpp.tiepadel.com/Tournaments/LigaMudum2026FaseRegularAbsZona8B/Draws" },
    { nome: "Zona 8B", tipo: "Veteranos", url: "https://fpp.tiepadel.com/Tournaments/8281b86b-4251-4751-ac33-68cd5aa3c37a/Draws" }
];

const cacheEquipas = new Set();

// --- FUNÇÃO: REGISTAR EQUIPA ---
async function registarEquipa(nome, zona, tipo, categoria, grupo) {
    const idUnico = `${nome}|${zona}|${tipo}|${categoria}|${grupo}`;
    if (cacheEquipas.has(idUnico)) return;

    const payload = { nome, zona, tipo, categoria, grupo };
    try {
        await fetch(`${SUPABASE_URL}/rest/v1/equipas`, {
            method: 'POST',
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': `Bearer ${SUPABASE_KEY}`,
                'Content-Type': 'application/json',
                'Prefer': 'resolution=ignore-duplicates'
            },
            body: JSON.stringify(payload)
        });
        cacheEquipas.add(idUnico);
    } catch (error) {
        // Falha silenciosa
    }
}

// --- FUNÇÃO: GUARDA DIRETAMENTE NO MOMENTO DA EXTRAÇÃO ---
async function guardarNoSupabaseEmTempoReal(jogosExtraidos) {
    if (!jogosExtraidos || jogosExtraidos.length === 0) return;

    let finalHomeScore = 0;
    let finalAwayScore = 0;
    let matchStatus = 'scheduled';

    for (const j of jogosExtraidos) {
        if (j.result && j.result.toLowerCase() !== 'tba' && j.result !== '') {
            let hSets = 0, aSets = 0;
            const sets = j.result.replace(/[^\d\s\-]/g, ' ').trim().split(/\s+/);

            for (let s of sets) {
                const parts = s.split('-');
                if (parts.length === 2) {
                    const h = parseInt(parts[0]);
                    const a = parseInt(parts[1]);
                    if (!isNaN(h) && !isNaN(a)) {
                        if (h > a) hSets++;
                        else if (a > h) aSets++;
                    }
                }
            }
            if (hSets > aSets) finalHomeScore++;
            else if (aSets > hSets) finalAwayScore++;
        }
    }

    if (finalHomeScore > 0 || finalAwayScore > 0) {
        matchStatus = 'completed';
    }

    for (const jogo of jogosExtraidos) {
        try {
            await registarEquipa(jogo.home_team, jogo.zona, jogo.tipo, jogo.categoria, jogo.grupo);
            await registarEquipa(jogo.away_team, jogo.zona, jogo.tipo, jogo.categoria, jogo.grupo);

            let matchId;

            const urlMatch = `${SUPABASE_URL}/rest/v1/matches?home_team=eq.${encodeURIComponent(jogo.home_team)}&away_team=eq.${encodeURIComponent(jogo.away_team)}&zona=eq.${encodeURIComponent(jogo.zona)}&tipo=eq.${encodeURIComponent(jogo.tipo)}&categoria=eq.${encodeURIComponent(jogo.categoria)}&select=id,data_jogo,status,home_score,away_score`;
            const resMatch = await fetch(urlMatch, { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` } });
            const matchesDb = await resMatch.json();

            if (!matchesDb || matchesDb.length === 0) {
                const payloadMatch = {
                    epoca: "2026",
                    fase: "Fase Regular",
                    zona: jogo.zona,
                    tipo: jogo.tipo,
                    categoria: jogo.categoria,
                    grupo: jogo.grupo,
                    home_team: jogo.home_team,
                    away_team: jogo.away_team,
                    data_jogo: jogo.data_jogo,
                    status: matchStatus,
                    home_score: matchStatus === 'completed' ? finalHomeScore : null,
                    away_score: matchStatus === 'completed' ? finalAwayScore : null
                };

                const resCreateMatch = await fetch(`${SUPABASE_URL}/rest/v1/matches`, {
                    method: 'POST',
                    headers: {
                        'apikey': SUPABASE_KEY,
                        'Authorization': `Bearer ${SUPABASE_KEY}`,
                        'Content-Type': 'application/json',
                        'Prefer': 'return=representation'
                    },
                    body: JSON.stringify(payloadMatch)
                });

                const newMatch = await resCreateMatch.json();
                matchId = newMatch[0].id;
                console.log(`   🆕 Novo Encontro Criado na BD: ${jogo.home_team} vs ${jogo.away_team}`);
            } else {
                matchId = matchesDb[0].id;

                let updatePayload = {};

                if (jogo.data_jogo && matchesDb[0].data_jogo !== jogo.data_jogo) {
                    updatePayload.data_jogo = jogo.data_jogo;
                }

                if (matchesDb[0].status !== matchStatus) {
                    updatePayload.status = matchStatus;
                }

                const dbHomeScore = matchesDb[0].home_score ?? -1;
                const dbAwayScore = matchesDb[0].away_score ?? -1;

                if (matchStatus === 'completed' && (dbHomeScore !== finalHomeScore || dbAwayScore !== finalAwayScore)) {
                    updatePayload.home_score = finalHomeScore;
                    updatePayload.away_score = finalAwayScore;
                }

                if (Object.keys(updatePayload).length > 0) {
                    await fetch(`${SUPABASE_URL}/rest/v1/matches?id=eq.${matchId}`, {
                        method: 'PATCH',
                        headers: {
                            'apikey': SUPABASE_KEY,
                            'Authorization': `Bearer ${SUPABASE_KEY}`,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify(updatePayload)
                    });
                }
            }

            const urlDetail = `${SUPABASE_URL}/rest/v1/match_details?match_id=eq.${matchId}&rubber_number=eq.${jogo.rubber_number}&select=id,result,home_duo,away_duo`;
            const resDetail = await fetch(urlDetail, { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` } });
            const detailsDb = await resDetail.json();

            const payloadDetail = {
                match_id: matchId,
                rubber_number: jogo.rubber_number,
                home_duo: jogo.home_duo,
                away_duo: jogo.away_duo,
                result: jogo.result
            };

            if (detailsDb && detailsDb.length > 0) {
                const detailId = detailsDb[0].id;
                const resultAntigo = detailsDb[0].result;

                if (resultAntigo !== jogo.result || detailsDb[0].home_duo !== jogo.home_duo) {
                    await fetch(`${SUPABASE_URL}/rest/v1/match_details?id=eq.${detailId}`, {
                        method: 'PATCH',
                        headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' },
                        body: JSON.stringify(payloadDetail)
                    });
                }
            } else {
                await fetch(`${SUPABASE_URL}/rest/v1/match_details`, {
                    method: 'POST',
                    headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify(payloadDetail)
                });
            }
        } catch (error) {
            console.error(`   ❌ Falha a guardar na BD o encontro:`, error.message);
        }
    }
}

// --- O MOTOR DO PUPPETEER (ESTRATÉGIA DE POSTBACK) ---
(async () => {
    console.log("🚀 A iniciar a 'Aranha' PadelNetwork - ESTRATÉGIA POSTBACK...");

    const browser = await puppeteer.launch({
        headless: "new",
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
        defaultViewport: null,
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1366, height: 768 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');

    try {
        for (const torneio of TORNEIOS_LIGA) {
            console.log(`\n==================================================`);
            console.log(`🌍 A INICIAR EXTRAÇÃO: ${torneio.nome} | ${torneio.tipo}`);
            console.log(`==================================================`);

            try {
                await page.goto(torneio.url, { waitUntil: 'networkidle2' });
                await page.waitForSelector('#drop_tournaments', { visible: true, timeout: 10000 });
            } catch (e) {
                console.error(`❌ Erro ao carregar a página da ${torneio.nome}. A saltar...`);
                continue;
            }

            const categorias = await page.evaluate(() => {
                const select = document.querySelector('#drop_tournaments');
                if (!select) return [];
                return Array.from(select.options)
                    .filter(opt => opt.value !== "0" && opt.innerText.trim() !== "")
                    .map(opt => ({ valor: opt.value, nome: opt.innerText.trim() }));
            });

            for (const cat of categorias) {
                console.log(`\n🎾 A processar: ${torneio.tipo} > ${cat.nome}`);

                try {
                    await page.goto(torneio.url, { waitUntil: 'networkidle2' });
                    await page.waitForSelector('#drop_tournaments', { visible: true, timeout: 10000 });
                    await page.select('#drop_tournaments', cat.valor);
                    await new Promise(r => setTimeout(r, 4000));

                    // 1. CLICAR NO TAB "ENCONTROS"
                    const clicouEncontros = await page.evaluate(() => {
                        const links = Array.from(document.querySelectorAll('a, span, div'));
                        const encontrosLink = links.reverse().find(l => l.innerText && l.innerText.trim().toUpperCase() === 'ENCONTROS');
                        if (encontrosLink) {
                            encontrosLink.click();
                            return true;
                        }
                        return false;
                    });

                    if (!clicouEncontros) {
                        console.log("   ⚠️ Aba 'Encontros' não encontrada. A saltar...");
                        continue;
                    }

                    await new Promise(r => setTimeout(r, 4000));

                    // 2. DESCOBRIR OS GRUPOS/JORNADAS
                    const grupos = await page.evaluate(() => {
                        const links = Array.from(document.querySelectorAll('a'));
                        return links.map(l => l.innerText.trim()).filter(text => text.includes("Grupo") || text === "Main");
                    });

                    if (grupos.length === 0) {
                        console.log("   ⚠️ Nenhum grupo encontrado.");
                        continue;
                    }

                    for (const grupo of grupos) {
                        console.log(`   🔎 A procurar jogos em: ${grupo}...`);

                        await page.evaluate((nomeGrupo) => {
                            const links = Array.from(document.querySelectorAll('a'));
                            const target = links.find(l => l.innerText.trim() === nomeGrupo);
                            if (target) target.click();
                        }, grupo);

                        await new Promise(r => setTimeout(r, 3000));

                        // --- 3. MAPEAMENTO DOS JOGOS (Lê a tabela antes de clicar!) ---
                        const metadadosJogos = await page.evaluate(() => {
                            const arr = [];
                            const btns = document.querySelectorAll('a[id*="link_open_rubbers"], a[mytitle="Abrir"], a.btn-action-grid');

                            btns.forEach((btn) => {
                                const tr = btn.closest('tr');
                                if (tr) {
                                    const tds = Array.from(tr.querySelectorAll('td'));
                                    let home = "Equipa Casa", away = "Equipa Fora", dataJogo = null;

                                    const dashIdx = tds.findIndex(td => td.innerText.trim() === '-');
                                    if (dashIdx > 0) {
                                        // Filtro "Anti-Certos": Remove o ✔ e os espaços!
                                        home = tds[dashIdx - 1].innerText.replace(/✔/g, '').trim();
                                        away = tds[dashIdx + 1].innerText.replace(/✔/g, '').trim();
                                    }

                                    const dateRegex = /(\d{4}-\d{2}-\d{2})[,\s]*(\d{2}:\d{2})?/;
                                    for (let td of tds) {
                                        const match = td.innerText.match(dateRegex);
                                        if (match) {
                                            dataJogo = match[2] ? `${match[1]} ${match[2]}:00` : `${match[1]} 00:00:00`;
                                            break;
                                        }
                                    }

                                    if(home !== "Equipa Casa") {
                                        arr.push({ home, away, dataJogo });
                                    }
                                }
                            });
                            return arr;
                        });

                        console.log(`      📊 Encontrados ${metadadosJogos.length} encontros com botão.`);

                        if (metadadosJogos.length === 0) continue;

                        // --- 4. O LOOP DO CLIQUE E EXTRAÇÃO ---
                        for (let i = 0; i < metadadosJogos.length; i++) {
                            const meta = metadadosJogos[i];
                            try {
                                console.log(`      -> A extrair: ${meta.home} vs ${meta.away}...`);

                                await Promise.all([
                                    page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }).catch(() => {}),
                                    page.evaluate((index) => {
                                        const btns = document.querySelectorAll('a[id*="link_open_rubbers"], a[mytitle="Abrir"], a.btn-action-grid');
                                        if (btns[index]) btns[index].click();
                                    }, i)
                                ]);

                                await new Promise(r => setTimeout(r, 4000));

                                // Extrai os Rubbers passando o contexto de fora
                                const jogosExtraidos = await page.evaluate((metaInfo, nomeCat, nomeGrupo, nomeZona, tipoTorneio) => {
                                    const details = [];

                                    // ✨ NOVA FUNÇÃO DE LIMPEZA BLINDADA ✨
                                    const cleanText = (text) => text
                                        .replace(/✔/g, '')
                                        .replace(/\n/g, ' / ')
                                        .replace(/\s+/g, ' ')
                                        .replace(/\s*\/\s*/g, ' / ')
                                        .replace(/(\s*\/\s*){2,}/g, ' / ')
                                        .replace(/^[\s/]+|[\s/]+$/g, '')
                                        .trim();

                                    document.querySelectorAll('table tr').forEach(row => {
                                        const tds = Array.from(row.querySelectorAll('td'));
                                        const rowTexts = tds.map(td => td.innerText.trim());
                                        const rIndex = rowTexts.findIndex(txt => /^R\d$/.test(txt));

                                        if (rIndex !== -1 && rowTexts.length > rIndex + 3) {
                                            const rubberNum = parseInt(rowTexts[rIndex].replace('R', ''));
                                            let homeDuo = cleanText(rowTexts[rIndex + 2]);
                                            let awayIndex = rowTexts[rIndex + 3] === '-' ? rIndex + 4 : rIndex + 3;
                                            let awayDuo = cleanText(rowTexts[awayIndex]);
                                            let scoreIndex = awayIndex + 1;
                                            if (rowTexts[scoreIndex] === '✔' || rowTexts[scoreIndex] === '') scoreIndex++;
                                            let score = cleanText(rowTexts[scoreIndex]);

                                            if (rubberNum && score && score !== "" && score !== "Tba") {
                                                details.push({
                                                    zona: nomeZona,
                                                    tipo: tipoTorneio,
                                                    categoria: nomeCat,
                                                    grupo: nomeGrupo,
                                                    home_team: metaInfo.home,
                                                    away_team: metaInfo.away,
                                                    data_jogo: metaInfo.dataJogo,
                                                    rubber_number: rubberNum,
                                                    home_duo: homeDuo,
                                                    away_duo: awayDuo,
                                                    result: score
                                                });
                                            }
                                        }
                                    });
                                    return details;
                                }, meta, cat.nome, grupo, torneio.nome, torneio.tipo);

                                if (jogosExtraidos.length > 0) {
                                    console.log(`      ✅ Sucesso! Lidos ${jogosExtraidos.length} rubbers. A guardar...`);
                                    await guardarNoSupabaseEmTempoReal(jogosExtraidos);
                                } else {
                                    console.log(`      ⚠️ Jogo sem detalhes publicados ou layout diferente.`);
                                }

                                // VOLTAR PARA A LISTA
                                await Promise.all([
                                    page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10000 }).catch(() => {}),
                                    page.evaluate(() => {
                                        const btn = Array.from(document.querySelectorAll('a, button')).find(el => el.innerText.trim().toUpperCase() === 'VOLTAR');
                                        if (btn) btn.click();
                                    })
                                ]);
                                await new Promise(r => setTimeout(r, 4000));

                            } catch (gameError) {
                                console.error(`   ⚠️ Erro de timeout neste jogo. A forçar retorno...`);
                                await page.evaluate(() => {
                                    const btn = Array.from(document.querySelectorAll('a, button')).find(el => el.innerText.trim().toUpperCase() === 'VOLTAR');
                                    if (btn) btn.click();
                                }).catch(() => {});
                                await new Promise(r => setTimeout(r, 4000));
                            }
                        }
                    }
                } catch (catError) {
                    console.error(`❌ Erro ao processar a categoria:`, catError.message);
                }
            }
        }
        console.log(`\n🎉 Processo Total Finalizado com Sucesso em Todo o País!`);

    } catch (err) {
        console.error("❌ Erro catastrófico no motor principal:", err);
    } finally {
        await browser.close();
        console.log("🛑 Browser fechado. Operação terminada.");
    }
})();