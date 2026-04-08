const puppeteer = require('puppeteer');

// --- CONFIGURAÇÕES DO SUPABASE ---
const SUPABASE_URL = process.env.SUPABASE_URL_SN_LIGA;
const SUPABASE_KEY = process.env.SUPABASE_KEY_SN_LIGA;

if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error("❌ ERRO: Chaves do Supabase não encontradas!");
    process.exit(1);
}

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

// --- FILTRO DE EXECUÇÃO ---
const ZONA_ALVO = process.env.SCRAPE_ZONA;
const TIPO_ALVO = process.env.SCRAPE_TIPO;
const CATEGORIA_ALVO = process.env.SCRAPE_CATEGORIA;

const torneiosParaCorrer = TORNEIOS_LIGA.filter(t => {
    const filterTipo = TIPO_ALVO ? t.tipo === TIPO_ALVO : true;
    const filterZona = ZONA_ALVO ? t.nome === ZONA_ALVO : true;
    return filterTipo && filterZona;
});

if (torneiosParaCorrer.length === 0) {
    console.log("⚠️ Nenhum torneio encontrado para os filtros:", { ZONA_ALVO, TIPO_ALVO });
    process.exit(0);
}

const cacheEquipas = new Set();

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
    } catch (error) {}
}

async function guardarNoSupabaseEmTempoReal(jogosExtraidos) {
    if (!jogosExtraidos || jogosExtraidos.length === 0) return;

    let finalHomeScore = 0, finalAwayScore = 0;
    let matchStatus = 'scheduled';

    for (const j of jogosExtraidos) {
        if (j.rubber_number && j.result && j.result.toLowerCase() !== 'tba' && j.result !== '') {
            let hSets = 0, aSets = 0;
            const sets = j.result.replace(/[^\d\s\-]/g, ' ').trim().split(/\s+/);
            for (let s of sets) {
                const parts = s.split('-');
                if (parts.length === 2) {
                    const h = parseInt(parts[0]), a = parseInt(parts[1]);
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

    if (finalHomeScore > 0 || finalAwayScore > 0) matchStatus = 'completed';

    const jogoBase = jogosExtraidos[0];

    // ✨ CORREÇÃO DE DATA: Blindagem total contra datas futuras em jogos passados
    let dataFinal = jogoBase.data_jogo;
    if (matchStatus === 'completed' && dataFinal) {
        const dataEncontrada = new Date(dataFinal);
        const agora = new Date();
        if (dataEncontrada > agora) {
            dataFinal = agora.toISOString().replace('T', ' ').split('.')[0];
        }
    }

    try {
        await registarEquipa(jogoBase.home_team, jogoBase.zona, jogoBase.tipo, jogoBase.categoria, jogoBase.grupo);
        await registarEquipa(jogoBase.away_team, jogoBase.zona, jogoBase.tipo, jogoBase.categoria, jogoBase.grupo);

        let matchId;
        const urlMatch = `${SUPABASE_URL}/rest/v1/matches?home_team=eq.${encodeURIComponent(jogoBase.home_team)}&away_team=eq.${encodeURIComponent(jogoBase.away_team)}&zona=eq.${encodeURIComponent(jogoBase.zona)}&tipo=eq.${encodeURIComponent(jogoBase.tipo)}&categoria=eq.${encodeURIComponent(jogoBase.categoria)}&select=id,data_jogo,status,home_score,away_score`;
        const resMatch = await fetch(urlMatch, { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` } });
        const matchesDb = await resMatch.json();

        if (!matchesDb || matchesDb.length === 0) {
            const payloadMatch = {
                epoca: "2026", fase: "Fase Regular", zona: jogoBase.zona, tipo: jogoBase.tipo,
                categoria: jogoBase.categoria, grupo: jogoBase.grupo, home_team: jogoBase.home_team,
                away_team: jogoBase.away_team, data_jogo: dataFinal, status: matchStatus,
                home_score: matchStatus === 'completed' ? finalHomeScore : null,
                away_score: matchStatus === 'completed' ? finalAwayScore : null
            };

            const resCreateMatch = await fetch(`${SUPABASE_URL}/rest/v1/matches`, {
                method: 'POST',
                headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json', 'Prefer': 'return=representation' },
                body: JSON.stringify(payloadMatch)
            });
            const newMatch = await resCreateMatch.json();
            matchId = newMatch[0].id;
        } else {
            matchId = matchesDb[0].id;
            let updatePayload = {};
            if (dataFinal && matchesDb[0].data_jogo !== dataFinal) updatePayload.data_jogo = dataFinal;
            if (matchesDb[0].status !== matchStatus) updatePayload.status = matchStatus;

            const dbHomeScore = matchesDb[0].home_score ?? -1;
            const dbAwayScore = matchesDb[0].away_score ?? -1;

            if (matchStatus === 'completed' && (dbHomeScore !== finalHomeScore || dbAwayScore !== finalAwayScore)) {
                updatePayload.home_score = finalHomeScore;
                updatePayload.away_score = finalAwayScore;
            }

            if (Object.keys(updatePayload).length > 0) {
                await fetch(`${SUPABASE_URL}/rest/v1/matches?id=eq.${matchId}`, {
                    method: 'PATCH',
                    headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify(updatePayload)
                });
            }
        }

        for (const r of jogosExtraidos) {
            if (!r.rubber_number) continue;
            const urlDetail = `${SUPABASE_URL}/rest/v1/match_details?match_id=eq.${matchId}&rubber_number=eq.${r.rubber_number}&select=id,result,home_duo,away_duo`;
            const resDetail = await fetch(urlDetail, { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` } });
            const detailsDb = await resDetail.json();
            const payloadDetail = { match_id: matchId, rubber_number: r.rubber_number, home_duo: r.home_duo, away_duo: r.away_duo, result: r.result };

            if (detailsDb && detailsDb.length > 0) {
                if (detailsDb[0].result !== r.result || detailsDb[0].home_duo !== r.home_duo) {
                    await fetch(`${SUPABASE_URL}/rest/v1/match_details?id=eq.${detailsDb[0].id}`, {
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
        }
    } catch (error) {}
}

(async () => {
    console.log(`🚀 A iniciar a 'Aranha' PadelNetwork - Filtros: ${ZONA_ALVO || 'Todas'} | ${TIPO_ALVO || 'Todos'}`);

    const browser = await puppeteer.launch({
        headless: "new",
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
        defaultViewport: null,
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1366, height: 768 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');

    try {
        for (const torneio of torneiosParaCorrer) {
            console.log(`\n🌍 EXTRAÇÃO: ${torneio.nome} | ${torneio.tipo}`);

            try {
                await page.goto(torneio.url, { waitUntil: 'networkidle2' });
                await page.waitForSelector('#drop_tournaments', { visible: true, timeout: 8000 });
            } catch (e) { continue; }

            const categorias = await page.evaluate(() => {
                const select = document.querySelector('#drop_tournaments');
                if (!select) return [];
                return Array.from(select.options)
                    .filter(opt => opt.value !== "0" && opt.innerText.trim() !== "")
                    .map(opt => ({ valor: opt.value, nome: opt.innerText.trim() }));
            });

            for (const cat of categorias) {
                if (CATEGORIA_ALVO && !cat.nome.toUpperCase().includes(CATEGORIA_ALVO.toUpperCase())) continue;

                console.log(`🎾 ${torneio.tipo} > ${cat.nome}`);

                try {
                    await page.goto(torneio.url, { waitUntil: 'networkidle2' });
                    await page.waitForSelector('#drop_tournaments', { visible: true, timeout: 8000 });
                    await page.select('#drop_tournaments', cat.valor);
                    await new Promise(r => setTimeout(r, 2000));

                    const clicouEncontros = await page.evaluate(() => {
                        const links = Array.from(document.querySelectorAll('a, span, div'));
                        const encontrosLink = links.reverse().find(l => l.innerText && l.innerText.trim().toUpperCase() === 'ENCONTROS');
                        if (encontrosLink) { encontrosLink.click(); return true; }
                        return false;
                    });

                    if (!clicouEncontros) continue;
                    await new Promise(r => setTimeout(r, 2000));

                    const grupos = await page.evaluate(() => {
                        const links = Array.from(document.querySelectorAll('a'));
                        return links.map(l => l.innerText.trim()).filter(text => text.includes("Grupo") || text === "Main");
                    });

                    for (const grupo of grupos) {
                        await Promise.all([
                            page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10000 }).catch(() => {}),
                            page.evaluate((nomeGrupo) => {
                                const links = Array.from(document.querySelectorAll('a'));
                                const target = links.find(l => l.innerText.trim() === nomeGrupo);
                                if (target) target.click();
                            }, grupo)
                        ]);

                        await new Promise(r => setTimeout(r, 1000));

                        const metadadosJogos = await page.evaluate(() => {
                            const arr = [];
                            let indexDoBotao = 0;

                            document.querySelectorAll('table tr').forEach((tr) => {
                                const tds = Array.from(tr.querySelectorAll('td'));
                                let home = "Equipa Casa", away = "Equipa Fora", dataJogo = null;

                                const dashIdx = tds.findIndex(td => td.innerText.trim() === '-');
                                if (dashIdx > 0) {
                                    home = tds[dashIdx - 1].innerText.replace(/✔/g, '').trim();
                                    away = tds[dashIdx + 1].innerText.replace(/✔/g, '').trim();
                                }

                                // ✨ SUPER REGEX: Ignora vírgulas e aceita ISO ou PT
                                const regexISO = /(\d{4}-\d{2}-\d{2})[,\s]*(\d{2}:\d{2})?/;
                                const regexPT = /(\d{2})\/(\d{2})\/(\d{4})[,\s]*(\d{2}:\d{2})?/;

                                for (let td of tds) {
                                    const text = td.innerText.trim();
                                    const matchISO = text.match(regexISO);
                                    const matchPT = text.match(regexPT);

                                    if (matchISO) {
                                        dataJogo = matchISO[2] ? `${matchISO[1]} ${matchISO[2]}:00` : `${matchISO[1]} 00:00:00`;
                                        break;
                                    } else if (matchPT) {
                                        dataJogo = `${matchPT[3]}-${matchPT[2]}-${matchPT[1]} ${matchPT[4] || '00:00'}:00`;
                                        break;
                                    }
                                }

                                if(home !== "Equipa Casa" && home !== "") {
                                    const btnLupa = tr.querySelector('a[id*="link_open_rubbers"], a[mytitle="Abrir"], a.btn-action-grid');
                                    let temBotao = !!btnLupa;
                                    let btnIdxToClick = temBotao ? indexDoBotao++ : -1;
                                    arr.push({ home, away, dataJogo, temBotao, btnIdxToClick });
                                }
                            });
                            return arr;
                        });

                        for (const meta of metadadosJogos) {
                            try {
                                if (!meta.temBotao) {
                                    await guardarNoSupabaseEmTempoReal([{
                                        zona: torneio.nome, tipo: torneio.tipo, categoria: cat.nome, grupo: grupo,
                                        home_team: meta.home, away_team: meta.away, data_jogo: meta.dataJogo
                                    }]);
                                    continue;
                                }

                                await Promise.all([
                                    page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10000 }).catch(() => {}),
                                    page.evaluate((idx) => {
                                        const btns = document.querySelectorAll('a[id*="link_open_rubbers"], a[mytitle="Abrir"], a.btn-action-grid');
                                        if (btns[idx]) btns[idx].click();
                                    }, meta.btnIdxToClick)
                                ]);

                                await new Promise(r => setTimeout(r, 1500));

                                const rubbers = await page.evaluate((metaInfo, nomeCat, nomeGrupo, nomeZona, tipoT) => {
                                    const details = [];
                                    const clean = (t) => t.replace(/✔/g, '').replace(/\n/g, ' / ').replace(/\s+/g, ' ').trim();
                                    document.querySelectorAll('table tr').forEach(row => {
                                        const tds = Array.from(row.querySelectorAll('td'));
                                        const texts = tds.map(td => td.innerText.trim());
                                        const rIdx = texts.findIndex(txt => /^R\d$/.test(txt));
                                        if (rIdx !== -1 && texts.length > rIdx + 3) {
                                            const rubberNum = parseInt(texts[rIdx].replace('R', ''));
                                            let scoreIdx = rIdx + 4;
                                            if (texts[scoreIdx] === '✔' || texts[scoreIdx] === '') scoreIdx++;
                                            details.push({
                                                zona: nomeZona, tipo: tipoT, categoria: nomeCat, grupo: nomeGrupo,
                                                home_team: metaInfo.home, away_team: metaInfo.away, data_jogo: metaInfo.dataJogo,
                                                rubber_number: rubberNum, home_duo: clean(texts[rIdx + 2]),
                                                away_duo: clean(texts[rIdx + 3] === '-' ? texts[rIdx + 4] : texts[rIdx + 3]),
                                                result: clean(texts[scoreIdx])
                                            });
                                        }
                                    });
                                    return details;
                                }, meta, cat.nome, grupo, torneio.nome, torneio.tipo);

                                await guardarNoSupabaseEmTempoReal(rubbers.length > 0 ? rubbers : [{
                                    zona: torneio.nome, tipo: torneio.tipo, categoria: cat.nome, grupo: grupo,
                                    home_team: meta.home, away_team: meta.away, data_jogo: meta.dataJogo
                                }]);

                                await Promise.all([
                                    page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10000 }).catch(() => {}),
                                    page.evaluate(() => {
                                        const btn = Array.from(document.querySelectorAll('a, button')).find(el => el.innerText.trim().toUpperCase() === 'VOLTAR');
                                        if (btn) btn.click();
                                    })
                                ]);
                                await new Promise(r => setTimeout(r, 1000));
                            } catch (e) {
                                await page.goBack().catch(() => {});
                            }
                        }
                    }
                } catch (catError) {}
            }
        }
    } catch (err) {} finally { await browser.close(); }
})();