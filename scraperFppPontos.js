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
    // 🚀 ADICIONADO: A coluna pontos_equipa captura o ranking para esta equipa específica
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
            // Fallback elegante caso a DB ainda não tenha a constraint (fpp_id, equipa_id) criada
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

            // 🚀 INÍCIO DA ALTERAÇÃO PARA PAGINAÇÃO
            let temProximaPagina = true;
            let paginaAtual = 1;

            while (temProximaPagina) {
                console.log(`   📄 Página ${paginaAtual}...`);

                // Mapear linhas de equipas da página atual
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

                if (linhasEquipas.length === 0) {
                    console.log("   ⚠️ Nenhuma equipa encontrada nesta página.");
                    break;
                }

                // Guardamos o nome da primeira equipa para comparar depois do clique
                const primeiraEquipaAntes = linhasEquipas[0].nomeEquipa;

                for (const eq of linhasEquipas) {
                    const chaveProcurada = `${eq.nomeEquipa}|${torneio.nome}|${torneio.tipo}|${eq.categoria}`.toLowerCase().trim();
                    let idEquipaDB = mapaEquipas[chaveProcurada] || mapaEquipas[eq.nomeEquipa.toLowerCase().trim()];

                    if (!idEquipaDB) {
                        console.log(`   ⏭️ Ignorada: [${eq.nomeEquipa}] (Não mapeada)`);
                        continue;
                    }

                    console.log(`   👥 Lendo plantel: ${eq.nomeEquipa}`);

                    // Limpeza preventiva da tabela de jogadores anterior (evita ler lixo se o site for lento)
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

                    // Extração do plantel (Tua lógica exata)
                    const plantel = await page.evaluate(() => {
                        const resultados = [];
                        const grids = document.querySelectorAll('table.rgMasterTable');
                        grids.forEach(table => {
                            const ths = Array.from(table.querySelectorAll('th'));
                            if (ths.length === 0) return;
                            let idxL = -1, idxN = -1, idxP = -1;
                            ths.forEach((th, index) => {
                                const text = th.innerText.toUpperCase().trim();
                                if (text.includes('LICEN')) idxL = index;
                                if (text === 'NOME' || text.includes('JOGADOR')) idxN = index;
                                if (text.includes('PONTOS')) idxP = index;
                            });
                            if (idxL === -1) idxL = 0; if (idxN === -1) idxN = 1;

                            table.querySelectorAll('tbody tr').forEach(tr => {
                                if (tr.classList.contains('rgHeader') || tr.classList.contains('rgPager')) return;
                                const tds = tr.querySelectorAll('td');
                                if (tds.length > 2) {
                                    const licenca = tds[idxL]?.innerText.trim();
                                    const nome = tds[idxN]?.innerText.trim();
                                    let pts = 0;
                                    if (idxP !== -1 && tds[idxP]) {
                                        pts = parseFloat(tds[idxP].innerText.trim().replace(/\./g, '').replace(',', '.')) || 0;
                                    } else {
                                        for (let i = tds.length - 1; i >= 2; i--) {
                                            const val = tds[i].innerText.trim();
                                            if (/^[0-9]+[.,][0-9]+$/.test(val) || /^[0-9]+$/.test(val)) {
                                                pts = parseFloat(val.replace(/\./g, '').replace(',', '.')) || 0;
                                                break;
                                            }
                                        }
                                    }
                                    if (/^\d+$/.test(licenca) && nome && nome.toUpperCase() !== "JOGADOR") {
                                        resultados.push({ nome, fpp_id: licenca, pontos_fpp: pts, updated_at: new Date().toISOString() });
                                    }
                                }
                            });
                        });
                        return resultados;
                    });

                    if (plantel.length > 0) {
                        await upsertJogadores(plantel, idEquipaDB);
                        console.log(`      ✅ ${plantel.length} jogadores atualizados.`);
                    }
                }

                // 🚀 CLIQUE NA PRÓXIMA PÁGINA
                const clicou = await page.evaluate(() => {
                    const nextBtn = document.querySelector('input.rgPageNext');
                    // Verifica se o botão existe e não está desativado pelo Telerik
                    if (nextBtn && !nextBtn.classList.contains('rgDisabled') && !nextBtn.disabled) {
                        nextBtn.click();
                        return true;
                    }
                    return false;
                });

                if (clicou) {
                    console.log("   🔄 A aguardar o carregamento da próxima página...");
                    try {
                        // 🚀 A GRANDE CORREÇÃO: Em vez de esperar 6 segundos fixos,
                        // fica a "espiar" a tabela até a primeira equipa mudar.
                        // Se o site for rápido, muda logo. Se for lento, espera até 12 segundos.
                        await page.waitForFunction(
                            (nomeAnterior) => {
                                const td = document.querySelector('table[id*="grid_all_teams"] tbody td:nth-child(3)');
                                // Retorna TRUE mal o nome da equipa mude (ou seja, a página nova carregou)
                                return td && td.innerText.trim() !== nomeAnterior;
                            },
                            { timeout: 12000 },
                            primeiraEquipaAntes
                        );

                        // Se a função acima não der erro, a página mudou com sucesso!
                        paginaAtual++;
                        await new Promise(r => setTimeout(r, 2000)); // Margem para estabilizar as classes CSS

                    } catch (e) {
                        // Se passarem os 12 segundos e a primeira equipa for a mesma,
                        // o bot percebe que o clique no "Next" não fez nada e encerra as páginas.
                        console.log("   🏁 Fim das páginas alcançado.");
                        temProximaPagina = false;
                    }
                } else {
                    temProximaPagina = false;
                }
            }
            // 🚀 FIM DA ALTERAÇÃO PARA PAGINAÇÃO

        } catch (err) {
            console.error(`   ❌ Erro na zona ${torneio.nome}:`, err.message);
        }
    }

    console.log("\n🏁 Sincronização Terminada!");
    await browser.close();
})();