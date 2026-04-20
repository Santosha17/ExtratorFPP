require('dotenv').config();
const puppeteer = require('puppeteer');

// Resolve o erro "fetch is not a function" em qualquer versão do Node
const fetch = globalThis.fetch || require('node-fetch');

// --- CONFIGURAÇÕES DO SUPABASE ---
const SUPABASE_URL = process.env.SUPABASE_URL_SN_LIGA;
const SUPABASE_KEY = process.env.SUPABASE_KEY_SN_LIGA;

// --- LISTA DE TORNEIOS ---
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

const mapaEquipas = {};

// 1. Carregar IDs das equipas
async function carregarEquipas() {
    console.log("📥 Mapeando IDs das equipas do Supabase (Busca Exaustiva)...");
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

// 2. Enviar jogadores para o Supabase (CORRIGIDO: Pontos associados à equipa)
async function upsertJogadores(plantel, idEquipaDB) {
    if (plantel.length === 0) return false;

    // 2.1 Dados do Jogador (Apenas para a tabela 'jogadores')
    const jogadores = plantel.map(j => ({
        fpp_id: j.fpp_id,
        nome: j.nome,
        pontos_fpp: j.pontos_fpp,
        updated_at: j.updated_at
    }));

    // 2.2 Dados de Ligação (Para a tabela 'jogadores_equipas')
    const ligacoes = plantel.map(j => ({
        fpp_id: j.fpp_id,
        equipa_id: idEquipaDB,
        pontos_equipa: j.pontos_fpp
    }));

    try {
        // A) GRAVAR JOGADOR E PONTOS GLOBAIS
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

        // B) GRAVAR A LIGAÇÃO À EQUIPA E OS PONTOS ESPECÍFICOS DESSA EQUIPA
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
            if (resLigacoes.status === 409 || (await resLigacoes.clone().text()).includes("conflict")) {
                console.warn("   ⚠️ Conflito no on_conflict da tabela de ligação. Verifica as tuas Chaves Únicas na DB.");
            } else {
                throw new Error(await resLigacoes.text());
            }
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

            // Clica na aba "EQUIPAS"
            const clicouEquipas = await page.evaluate(() => {
                const elements = Array.from(document.querySelectorAll('a, span, div.rtsLink'));
                const target = elements.find(el => el.innerText && el.innerText.trim().toUpperCase() === 'EQUIPAS');
                if (target) { target.click(); return true; }
                return false;
            });

            if (!clicouEquipas) {
                console.log("   ⚠️ Aba 'EQUIPAS' não encontrada.");
                continue;
            }

            await new Promise(r => setTimeout(r, 4000));

            // Mapear linhas de equipas
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

            console.log(`   🔎 Encontradas ${linhasEquipas.length} equipas no site.`);

            for (const eq of linhasEquipas) {
                const chaveProcurada = `${eq.nomeEquipa}|${torneio.nome}|${torneio.tipo}|${eq.categoria}`.toLowerCase().trim();
                let idEquipaDB = mapaEquipas[chaveProcurada];

                if (!idEquipaDB) {
                    idEquipaDB = mapaEquipas[eq.nomeEquipa.toLowerCase().trim()];
                }

                if (!idEquipaDB) {
                    console.log(`   ⏭️ Ignorada: [${eq.nomeEquipa}] (Não mapeada na DB)`);
                    continue;
                }

                console.log(`   👥 Lendo plantel: ${eq.nomeEquipa}`);

                // 1. CLIQUE NATIVO
                await page.evaluate((id) => {
                    const btn = document.getElementById(id);
                    if (btn) btn.click();
                }, eq.botaoId);

                // 2. Espera o carregamento dos jogadores no fundo da página
                await new Promise(r => setTimeout(r, 5000));

                // 3. EXTRAÇÃO À PROVA DE BALA (Pesquisa Telerik + PAGINAÇÃO SEGURA BRUTE FORCE) 🚀
                let plantelCompleto = [];
                let temProximaPagina = true;
                let paginaAtual = 1;
                const MAX_PAGINAS = 10; // Travão de segurança anti-loop infinito

                while (temProximaPagina && paginaAtual <= MAX_PAGINAS) {
                    console.log(`      📄 A ler página ${paginaAtual} do plantel...`);

                    const plantelPagina = await page.evaluate(() => {
                        const resultados = [];
                        const grids = document.querySelectorAll('table.rgMasterTable');

                        grids.forEach(table => {
                            const ths = Array.from(table.querySelectorAll('th'));
                            if (ths.length === 0) return;

                            let idxLicenca = -1, idxNome = -1, idxPontos = -1;

                            ths.forEach((th, index) => {
                                const text = th.innerText.toUpperCase().trim();
                                if (text.includes('LICEN')) idxLicenca = index;
                                if (text === 'NOME' || text.includes('JOGADOR')) idxNome = index;
                                if (text.includes('PONTOS')) idxPontos = index;
                            });

                            if (idxLicenca === -1) idxLicenca = 0;
                            if (idxNome === -1) idxNome = 1;

                            const rows = table.querySelectorAll('tbody tr');
                            rows.forEach(tr => {
                                if (tr.classList.contains('rgHeader') || tr.classList.contains('rgPager')) return;

                                const tds = tr.querySelectorAll('td');
                                if (tds.length > 2) {
                                    const licenca = tds[idxLicenca]?.innerText.trim();
                                    const nome = tds[idxNome]?.innerText.trim();
                                    let pontosLimpos = 0;

                                    if (idxPontos !== -1 && tds[idxPontos]) {
                                        const ptsText = tds[idxPontos].innerText.trim();
                                        pontosLimpos = parseFloat(ptsText.replace(/\./g, '').replace(',', '.')) || 0;
                                    } else {
                                        for (let i = tds.length - 1; i >= 2; i--) {
                                            const val = tds[i].innerText.trim();
                                            if (/^[0-9]+[.,][0-9]+$/.test(val) || /^[0-9]+$/.test(val)) {
                                                pontosLimpos = parseFloat(val.replace(/\./g, '').replace(',', '.')) || 0;
                                                break;
                                            }
                                        }
                                    }

                                    const isLicencaValida = /^\d+$/.test(licenca);

                                    if (isLicencaValida && nome && nome.toUpperCase() !== "JOGADOR") {
                                        resultados.push({
                                            nome: nome,
                                            fpp_id: licenca,
                                            pontos_fpp: pontosLimpos,
                                            updated_at: new Date().toISOString()
                                        });
                                    }
                                }
                            });
                        });
                        return resultados;
                    });

                    // ANTI-LOOP CHECK: Quantos jogadores *novos* apanhámos nesta página?
                    let novosJogadores = 0;
                    plantelPagina.forEach(p => {
                        if (!plantelCompleto.find(x => x.fpp_id === p.fpp_id)) {
                            plantelCompleto.push(p);
                            novosJogadores++;
                        }
                    });

                    // Se lemos uma página e não tinha ninguém novo, a paginação bloqueou. Quebra o loop!
                    if (novosJogadores === 0) {
                        console.log(`      🛑 Página ${paginaAtual} apenas devolveu duplicados. Fim da tabela alcançado.`);
                        break;
                    }

                    // Verificar se existe a próxima página do Telerik e clicar de forma inteligente e bruta
                    temProximaPagina = await page.evaluate(() => {
                        // 1. Tentar o botão padrão de "Next Page" da Telerik
                        const inputsNext = document.querySelectorAll('input.rgPageNext, input[title="Next Page"]');
                        for (let btn of inputsNext) {
                            if (!btn.disabled && !btn.className.includes('Disabled') && !btn.className.includes('rgPageNextDisabled')) {
                                btn.click();
                                return true;
                            }
                        }

                        // 2. Tentar encontrar a setinha ">" nas caixas de paginação
                        const linksPager = Array.from(document.querySelectorAll('.rgPager a, .rgPager span, .rgWrap a, td[class*="Pager"] a'));

                        for (let el of linksPager) {
                            const text = el.innerText.trim();
                            if (text === '>' || text === '>>' || text === 'Next' || text === 'Seguinte') {
                                if (el.tagName === 'A' && !el.className.includes('Disabled') && el.getAttribute('href') !== '#') {
                                    el.click();
                                    return true;
                                }
                                if (el.tagName === 'SPAN' || el.tagName === 'INPUT') {
                                    if(el.parentElement && !el.parentElement.className.includes('Disabled')) {
                                        el.click();
                                        return true;
                                    }
                                }
                            }
                        }

                        return false;
                    });

                    if (temProximaPagina) {
                        paginaAtual++;
                        // ⏱️ Tempo aumentado para 8 segundos para garantir o carregamento do AJAX
                        await new Promise(r => setTimeout(r, 8000));
                    }
                }

                if (paginaAtual > MAX_PAGINAS) {
                    console.log(`      ⚠️ Limite de segurança de ${MAX_PAGINAS} páginas atingido. Possível loop nativo abortado.`);
                }

                if (plantelCompleto.length > 0) {
                    const sucesso = await upsertJogadores(plantelCompleto, idEquipaDB);
                    if (sucesso) {
                        console.log(`      ✅ ${plantelCompleto.length} jogadores atualizados e ligados à equipa!`);
                    }
                } else {
                    console.log(`      ⚠️ Zero jogadores. (Botão não carregou, layout estranho, ou equipa vazia)`);
                }
            }

        } catch (err) {
            console.error(`   ❌ Erro na zona ${torneio.nome}:`, err.message);
        }
    }

    console.log("\n🏁 Sincronização Terminada com Sucesso!");
    await browser.close();
})();