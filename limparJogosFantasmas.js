process.env.UV_THREADPOOL_SIZE = '128';
const dns = require('node:dns');
if (dns.setDefaultResultOrder) dns.setDefaultResultOrder('ipv4first');
require('dotenv').config();

const SUPABASE_URL = process.env.SUPABASE_URL_SN_LIGA;
const SUPABASE_KEY = process.env.SUPABASE_KEY_SN_LIGA;

if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error("❌ ERRO: Chaves do Supabase não encontradas!");
    process.exit(1);
}

const isDryRun = process.argv.includes('--dry-run');

async function fetchWithRetry(url, options = {}, retries = 5) {
    for (let i = 0; i < retries; i++) {
        try {
            const res = await fetch(url, options);
            if (res) return res;
        } catch (err) {
            if (i === retries - 1) throw err;
            await new Promise(r => setTimeout(r, 1000 * Math.pow(1.5, i)));
        }
    }
}

function cleanTeamName(name) {
    if (!name) return "";
    return name
        .replace(/✔/g, '')
        .replace(/[’‘`]/g, "'")
        .replace(/\s+/g, ' ')
        .trim();
}

function isPlaceholderTeam(name) {
    if (!name) return true;
    const n = name.toLowerCase().trim();
    if (n === "" || n === "equipa casa" || n === "equipa fora" || n === "unknown" || n === "a definir" || n === "tbd") return true;
    if (/\bor\b/i.test(n)) return true; // ex: "Equipa A or Equipa B"
    if (/\bvenc\.?\b/i.test(n) || /\bvencedor\b/i.test(n) || /\bwinner\b/i.test(n)) return true;
    if (/\bderr\.?\b/i.test(n) || /\bderrotado\b/i.test(n) || /\bloser\b/i.test(n)) return true;
    if (/^[a-z]\d+\s*[-/]\s*[a-z]\d+$/i.test(n)) return true; // ex: "A1/B2"
    return false;
}

(async () => {
    console.log("=================================================");
    console.log("🧹 DETETOR E LIMPADOR DE JOGOS FANTASMAS & DUPLICADOS");
    console.log(`Modo: ${isDryRun ? '🔍 SIMULAÇÃO (--dry-run)' : '⚡ EXECUÇÃO REAL'}`);
    console.log("=================================================\n");

    console.log("📥 A descarregar todos os jogos da tabela 'matches' do Supabase...");

    const res = await fetchWithRetry(`${SUPABASE_URL}/rest/v1/matches?select=id,home_team,away_team,zona,categoria,grupo,fase,data_jogo,status,home_score,away_score`, {
        headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
    });

    if (!res.ok) {
        console.error("❌ Erro ao descarregar jogos:", await res.text());
        process.exit(1);
    }

    const matches = await res.json();
    console.log(`📋 Total de jogos na base de dados: ${matches.length}\n`);

    const idsParaApagar = new Set();
    const motivos = new Map();

    // 1. IDENTIFICAR JOGOS COM NOMES FANTASMAS / PLACEHOLDERS
    for (const m of matches) {
        if (isPlaceholderTeam(m.home_team) || isPlaceholderTeam(m.away_team)) {
            idsParaApagar.add(m.id);
            motivos.set(m.id, `Placeholder/Inválido: "${m.home_team}" vs "${m.away_team}"`);
        }
    }

    console.log(`👻 Jogos com nomes inválidos/placeholders encontrados: ${idsParaApagar.size}`);

    // 2. IDENTIFICAR DUPLICADOS REAIS (Mesma Zona, Categoria, Fase e Equipas)
    const gruposJogos = new Map();

    for (const m of matches) {
        if (idsParaApagar.has(m.id)) continue;

        const homeNorm = cleanTeamName(m.home_team).toLowerCase();
        const awayNorm = cleanTeamName(m.away_team).toLowerCase();
        const zonaNorm = (m.zona || '').toLowerCase().trim();
        const catNorm = (m.categoria || '').toLowerCase().trim();
        const faseNorm = (m.fase || '').toLowerCase().trim();

        // Chave canónica (ordem alfabética das equipas para apanhar inversões casa/fora no mesmo dia)
        const dateDay = m.data_jogo ? m.data_jogo.split('T')[0] : 'no-date';
        const teamsSorted = [homeNorm, awayNorm].sort().join(' vs ');
        const chave = `${zonaNorm}|${catNorm}|${faseNorm}|${teamsSorted}|${dateDay}`;

        if (!gruposJogos.has(chave)) {
            gruposJogos.set(chave, []);
        }
        gruposJogos.get(chave).push(m);
    }

    let totalDuplicadosRemovidos = 0;

    for (const [chave, lista] of gruposJogos.entries()) {
        if (lista.length > 1) {
            // Temos jogos duplicados! Decidir qual manter:
            // 1. Prioridade a jogos com status 'completed' ou com resultado (home_score != null)
            // 2. Prioridade a jogos com data_jogo definida
            // 3. ID mais recente
            lista.sort((a, b) => {
                const aTemResultado = (a.home_score !== null && a.away_score !== null) ? 1 : 0;
                const bTemResultado = (b.home_score !== null && b.away_score !== null) ? 1 : 0;
                if (aTemResultado !== bTemResultado) return bTemResultado - aTemResultado;

                const aTemData = a.data_jogo ? 1 : 0;
                const bTemData = b.data_jogo ? 1 : 0;
                if (aTemData !== bTemData) return bTemData - aTemData;

                return b.id - a.id;
            });

            const manter = lista[0];
            const duplicados = lista.slice(1);

            for (const dup of duplicados) {
                idsParaApagar.add(dup.id);
                motivos.set(dup.id, `Duplicado de [ID ${manter.id} | ${manter.home_team} vs ${manter.away_team} (${manter.home_score ?? '-'}-${manter.away_score ?? '-'})]`);
                totalDuplicadosRemovidos++;
            }
        }
    }

    console.log(`👥 Cópias duplicadas identificadas para remoção: ${totalDuplicadosRemovidos}`);
    console.log(`\n🚨 TOTAL DE REGISTOS A REMOVER: ${idsParaApagar.size}\n`);

    if (idsParaApagar.size === 0) {
        console.log("✨ A base de dados já está 100% limpa! Nenhum jogo fantasma encontrado.");
        process.exit(0);
    }

    // Listar amostra dos que serão apagados
    let contador = 0;
    for (const id of idsParaApagar) {
        if (contador++ < 15) {
            console.log(`   ❌ [ID ${id}] Motivo: ${motivos.get(id)}`);
        }
    }
    if (idsParaApagar.size > 15) {
        console.log(`   ... e mais ${idsParaApagar.size - 15} registos.`);
    }

    if (isDryRun) {
        console.log("\n⚠️ SIMULAÇÃO TERMINADA. Nenhum dado foi apagado. Corra sem '--dry-run' para aplicar a limpeza.");
        process.exit(0);
    }

    console.log("\n⚡ A executar limpeza no Supabase...");

    const idsArray = Array.from(idsParaApagar);
    const chunkSize = 50;
    let apagados = 0;

    for (let i = 0; i < idsArray.length; i += chunkSize) {
        const chunk = idsArray.slice(i, i + chunkSize);
        
        // 1. Apagar primeiro match_details correspondentes
        await fetchWithRetry(`${SUPABASE_URL}/rest/v1/match_details?match_id=in.(${chunk.join(',')})`, {
            method: 'DELETE',
            headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
        });

        // 2. Apagar os jogos da tabela matches
        const resDel = await fetchWithRetry(`${SUPABASE_URL}/rest/v1/matches?id=in.(${chunk.join(',')})`, {
            method: 'DELETE',
            headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
        });

        if (resDel.ok) {
            apagados += chunk.length;
            process.stdout.write(`\r   Progresso: ${apagados}/${idsArray.length} jogos apagados...`);
        } else {
            console.error(`\n   ❌ Erro ao apagar lote:`, await resDel.text());
        }
    }

    console.log("\n\n🏆 LIMPEZA CONCLUÍDA COM SUCESSO!");
    console.log(`✨ Foram eliminados ${apagados} jogos fantasmas e duplicados da base de dados.`);
})();
