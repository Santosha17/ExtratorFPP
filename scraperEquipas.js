require('dotenv').config();
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

const ZONA_ALVO = process.env.SCRAPE_ZONA;
const TIPO_ALVO = process.env.SCRAPE_TIPO;

const torneiosParaCorrer = TORNEIOS_LIGA.filter(t => {
    const filterTipo = TIPO_ALVO ? t.tipo === TIPO_ALVO : true;
    const filterZona = ZONA_ALVO ? t.nome === ZONA_ALVO : true;
    return filterTipo && filterZona;
});

function normalizarNome(nome) {
    if (!nome) return "";
    return nome.toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]/g, "");
}

const mapaClubes = {};

async function carregarClubesDoSupabase() {
    console.log("📥 A carregar lista de Clubes do Supabase...");
    try {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/clubes?select=id,nome`, {
            headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
        });
        const clubes = await res.json();
        if (clubes && clubes.length > 0) {
            clubes.forEach(c => { mapaClubes[normalizarNome(c.nome)] = c.id; });
        }
        console.log(`✅ ${Object.keys(mapaClubes).length} clubes memorizados!`);
    } catch (e) {
        console.error("❌ Falha ao carregar clubes:", e.message);
    }
}

async function guardarEquipasCompletasNoSupabase(equipasExtraidas) {
    if (!equipasExtraidas || equipasExtraidas.length === 0) return;

    for (const eq of equipasExtraidas) {
        try {
            let idDoClube = null;
            let clubeTextoSite = eq.clube_nome_temporario ? eq.clube_nome_temporario.trim() : null;

            if (clubeTextoSite) {
                const nomeNorm = normalizarNome(clubeTextoSite);

                if (mapaClubes[nomeNorm]) {
                    idDoClube = mapaClubes[nomeNorm];
                } else {
                    // GOD MODE: AUTO-CRIAR CLUBE SE NÃO EXISTIR
                    try {
                        const resInsert = await fetch(`${SUPABASE_URL}/rest/v1/clubes`, {
                            method: 'POST',
                            headers: {
                                'apikey': SUPABASE_KEY,
                                'Authorization': `Bearer ${SUPABASE_KEY}`,
                                'Content-Type': 'application/json',
                                'Prefer': 'return=representation'
                            },
                            body: JSON.stringify({ nome: clubeTextoSite })
                        });

                        const novoClubeDb = await resInsert.json();
                        if (novoClubeDb && novoClubeDb.length > 0) {
                            idDoClube = novoClubeDb[0].id;
                            mapaClubes[nomeNorm] = idDoClube;
                            console.log(`   🏠 CLUBE AUTO-CRIADO: [${clubeTextoSite}]`);
                        }
                    } catch (errClube) {
                        console.error(`   ❌ Erro ao auto-criar o clube: ${clubeTextoSite}`);
                    }
                }
            }

            const payloadFinal = {
                nome: eq.nome,
                zona: eq.zona,
                tipo: eq.tipo,
                categoria: eq.categoria,
                grupo: eq.grupo,
                clube_id: idDoClube
            };

            await fetch(`${SUPABASE_URL}/rest/v1/equipas?on_conflict=nome,zona,tipo,categoria,grupo`, {
                method: 'POST',
                headers: {
                    'apikey': SUPABASE_KEY,
                    'Authorization': `Bearer ${SUPABASE_KEY}`,
                    'Content-Type': 'application/json',
                    'Prefer': 'resolution=merge-duplicates'
                },
                body: JSON.stringify(payloadFinal)
            });

            const infoClube = idDoClube ? `Linkado 🔗 (${clubeTextoSite})` : (clubeTextoSite ? `Falha Crítica ⚠️ (${clubeTextoSite})` : 'Nulo (Vazio no site) ⚠️');
            console.log(`   ✅ Equipa: ${eq.nome} (${eq.categoria} - ${eq.grupo}) | Clube: ${infoClube}`);

        } catch (error) {
            console.error(`   ❌ Falha ao gravar a equipa ${eq.nome}:`, error.message);
        }
    }
}

(async () => {
    console.log(`🚀 A iniciar Extrator GLOBAL DE EQUIPAS (Filtro Duplicados Corrigido) - Filtros: ${ZONA_ALVO || 'Todas'} | ${TIPO_ALVO || 'Todos'}`);

    await carregarClubesDoSupabase();

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
            console.log(`\n==================================================`);
            console.log(`🌍 A EXTRAIR EQUIPAS DA: ${torneio.nome} | ${torneio.tipo}`);
            console.log(`==================================================`);

            try {
                await page.goto(torneio.url, { waitUntil: 'networkidle2' });

                const clicouEquipas = await page.evaluate(() => {
                    const links = Array.from(document.querySelectorAll('a, span, div'));
                    const equipasLink = links.reverse().find(l => l.innerText && l.innerText.trim().toUpperCase() === 'EQUIPAS');
                    if (equipasLink) {
                        equipasLink.click();
                        return true;
                    }
                    return false;
                });

                if (!clicouEquipas) {
                    console.log("   ⚠️ Aba 'Equipas' não encontrada na Zona.");
                    continue;
                }

                await new Promise(r => setTimeout(r, 3000));
                await page.waitForSelector('table tr', { timeout: 8000 }).catch(() => {});

                let totalDePaginas = await page.evaluate(() => {
                    const match = document.body.innerText.match(/items in (\d+) pages/i);
                    return match ? parseInt(match[1], 10) : 1;
                });

                let equipasExtraidasZona = 0;

                for (let paginaAtual = 1; paginaAtual <= totalDePaginas; paginaAtual++) {
                    console.log(`   📄 A ler Página ${paginaAtual} de ${totalDePaginas} da ${torneio.nome}...`);

                    const equipasNestaPagina = await page.evaluate((zona, tipo) => {
                        const resultados = [];
                        const setAntiDuplicados = new Set();
                        const tables = document.querySelectorAll('table');

                        tables.forEach(table => {
                            const rows = table.querySelectorAll('tbody tr');
                            const headers = Array.from(table.querySelectorAll('th'));

                            if (headers.length === 0) return;

                            let seccaoIdx = 0, equipaIdx = 1, deIdx = 2;

                            headers.forEach((th, index) => {
                                const txt = th.innerText.trim().toUpperCase();
                                if (txt.includes('SEC')) seccaoIdx = index;
                                if (txt.includes('EQUIPA')) equipaIdx = index;
                                if (txt === 'DE' || txt.startsWith('DE\n') || txt.startsWith('DE ')) deIdx = index;
                            });

                            rows.forEach(tr => {
                                const tds = tr.querySelectorAll('td');

                                if (tds.length <= Math.max(equipaIdx, deIdx)) return;

                                const nomeDaEquipa = tds[equipaIdx].innerText.trim();

                                let cNome = tds[deIdx].innerText.trim();
                                if (cNome === '-' || cNome === '') cNome = null;

                                let rawSec = tds[seccaoIdx] ? tds[seccaoIdx].innerText.trim() : "Desconhecida";
                                let categoriaFinal = rawSec;
                                let grupoFinal = "Main";

                                if (rawSec) {
                                    if (rawSec.includes('-')) {
                                        const parts = rawSec.split('-');
                                        categoriaFinal = parts[0].trim();
                                        grupoFinal = parts[1].trim();
                                        if (!grupoFinal.toLowerCase().includes('grupo')) grupoFinal = "Grupo " + grupoFinal;
                                    } else if (rawSec.toLowerCase().includes('grupo')) {
                                        const match = rawSec.match(/(.*)\s+(Grupo.*)/i);
                                        if (match) {
                                            categoriaFinal = match[1].trim();
                                            grupoFinal = match[2].trim();
                                        }
                                    }
                                }

                                if (nomeDaEquipa && nomeDaEquipa !== '-' && nomeDaEquipa.toUpperCase() !== 'EQUIPA') {
                                    // ✨ MAGIA DA CORREÇÃO: Agora o Set valida Equipa + Categoria + Grupo
                                    const chave = `${nomeDaEquipa}|${categoriaFinal}|${grupoFinal}`;

                                    if (!setAntiDuplicados.has(chave)) {
                                        setAntiDuplicados.add(chave);
                                        resultados.push({
                                            nome: nomeDaEquipa,
                                            zona: zona,
                                            tipo: tipo,
                                            categoria: categoriaFinal,
                                            grupo: grupoFinal,
                                            clube_nome_temporario: cNome
                                        });
                                    }
                                }
                            });
                        });

                        return resultados;
                    }, torneio.nome, torneio.tipo);

                    equipasExtraidasZona += equipasNestaPagina.length;
                    await guardarEquipasCompletasNoSupabase(equipasNestaPagina);

                    if (paginaAtual < totalDePaginas) {
                        await page.evaluate(() => {
                            const btnNext = document.querySelector('input.rgPageNext, input[title="Next Page"]');
                            if (btnNext) btnNext.click();
                        });
                        await new Promise(r => setTimeout(r, 3500));
                    }
                }

                console.log(`   🔎 Fim da ${torneio.nome}. Foram extraídas ${equipasExtraidasZona} equipas no total desta zona.`);

            } catch (e) {
                console.error(`   ❌ Erro na zona ${torneio.nome}:`, e.message);
            }
        }

        console.log(`\n🎉 Processo Finalizado! TODAS as Equipas e Clubes estão sintonizados sem crashar!`);

    } catch (err) {
        console.error("❌ Erro catastrófico no motor principal:", err);
    } finally {
        await browser.close();
        console.log("🛑 Browser fechado.");
    }
})();