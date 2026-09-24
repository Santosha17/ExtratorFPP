process.env.UV_THREADPOOL_SIZE = '128';
const dns = require('node:dns');
if (dns.setDefaultResultOrder) dns.setDefaultResultOrder('ipv4first');

require('dotenv').config({ path: '../.env' });
if (!process.env.SUPABASE_URL_SN_LIGA) {
    require('dotenv').config();
}

const SUPABASE_URL = process.env.SUPABASE_URL_SN_LIGA;
const SUPABASE_KEY = process.env.SUPABASE_KEY_SN_LIGA;

if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error("❌ ERRO: Credenciais do Supabase não encontradas no .env!");
    process.exit(1);
}

const headers = {
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json'
};

const delay = (ms) => new Promise(r => setTimeout(r, ms));

async function fetchWithRetry(url, options = {}, retries = 5) {
    for (let i = 0; i < retries; i++) {
        try {
            const res = await fetch(url, options);
            if (res) return res;
        } catch (err) {
            if (i === retries - 1) throw err;
            await delay(1000 * Math.pow(1.5, i));
        }
    }
}

// -----------------------------------------------------------------------------
// FORMATADOR DE SCORES
// -----------------------------------------------------------------------------
function formatarScore(str) {
    if (!str) return 'Pendente';
    let s = str.trim();
    if (s === '' || s.toLowerCase() === 'pendente') return 'Pendente';
    if (/walkover/i.test(s)) return s.toLowerCase().includes('double') ? 'Double Walkover' : 'Walkover';

    let retd = '';
    if (/ret'?d/i.test(s)) {
        retd = " Ret'd";
        s = s.replace(/ret'?d/i, '').trim();
    }

    const setRegex = /(\d{1,2}\s*-\s*\d{1,2}(?:\s*\(\d{1,2}\))?|\[\s*\d{1,2}\s*-\s*\d{1,2}\s*\])/g;
    const matches = s.match(setRegex);

    if (matches && matches.length > 0) {
        const formattedSets = matches.map(m => {
            return m.replace(/\s*-\s*/, '-')
                    .replace(/\s*\(\s*(\d+)\s*\)/, ' ($1)')
                    .replace(/\[\s*(\d+)-(\d+)\s*\]/, '[$1-$2]')
                    .trim();
        });
        return formattedSets.join(' ') + retd;
    }

    return s + retd;
}

function isSchedule(name) {
    if (!name) return true;
    const n = name.trim();
    if (n === '' || n.toLowerCase() === 'bye' || n.toLowerCase() === 'pendente') return true;
    if (/^\d{4}-\d{2}-\d{2}/.test(n) || /^\d{1,2}\/\d{1,2}/.test(n) || /^\d{1,2}:\d{2}/.test(n)) return true;
    if (/^[0-9][A-Z]\s*\/\s*[0-9][A-Z]$/i.test(n)) return true;
    return false;
}

// -----------------------------------------------------------------------------
// MOTOR DE LIMPEZA
// -----------------------------------------------------------------------------
(async () => {
    console.log("==========================================================");
    console.log("🧹 A iniciar Higienização das Tabelas de Torneios Federados...");
    console.log("==========================================================");

    // 1. LIMPAR DUPLAS "BYE"
    console.log("\n1️⃣  A eliminar duplas 'Bye' em torneiosfpp_duplas...");
    try {
        const resDelBye = await fetchWithRetry(`${SUPABASE_URL}/rest/v1/torneiosfpp_duplas?or=(nome_a.ilike.*bye*,nome_b.ilike.*bye*,nome_a.ilike.*desist*,nome_b.ilike.*desist*)`, {
            method: 'DELETE',
            headers: { ...headers, 'Prefer': 'return=representation' }
        });
        if (resDelBye && resDelBye.ok) {
            const deleted = await resDelBye.json();
            console.log(`   ✅ Eliminadas ${deleted.length} duplas 'Bye' com sucesso!`);
        } else {
            console.log("   ⚠️ Sem duplas 'Bye' para eliminar ou tabela já limpa.");
        }
    } catch (e) {
        console.error("   ❌ Erro ao apagar duplas 'Bye':", e.message);
    }

    // 2. CORRIGIR JOGOS COM SCORES COLADOS OU DATAS COMO EQUIPAS
    console.log("\n2️⃣  A analisar e corrigir jogos em torneiosfpp_matches...");

    const PAGE_SIZE = 500;
    let offset = 0;
    let totalCorrigidos = 0;
    let totalAnalisados = 0;

    while (true) {
        const queryUrl = `${SUPABASE_URL}/rest/v1/torneiosfpp_matches?select=id,resultado,equipa_a,equipa_b,data_hora_campo&order=id.asc&range=${offset}-${offset + PAGE_SIZE - 1}`;
        const res = await fetchWithRetry(queryUrl, {
            headers: { ...headers, 'Range': `${offset}-${offset + PAGE_SIZE - 1}` }
        });

        if (!res || !res.ok) {
            console.log("   🏁 Fim da leitura de jogos.");
            break;
        }

        const matches = await res.json();
        if (!matches || matches.length === 0) break;

        totalAnalisados += matches.length;

        for (const m of matches) {
            let needsUpdate = false;
            const patchPayload = {};

            // A. Formatação de Resultado
            const scoreFormatado = formatarScore(m.resultado);
            if (scoreFormatado !== m.resultado && m.resultado !== 'Pendente') {
                patchPayload.resultado = scoreFormatado;
                needsUpdate = true;
            }

            // B. Detetar se equipa_a ou equipa_b eram datas/horários
            let dhc = m.data_hora_campo || '';
            let eqA = m.equipa_a;
            let eqB = m.equipa_b;

            if (isSchedule(eqA)) {
                if (!dhc && (/^\d{4}-\d{2}-\d{2}/.test(eqA) || /^\d{1,2}\/\d{1,2}/.test(eqA))) {
                    dhc = eqA;
                }
                eqA = 'A definir';
                patchPayload.equipa_a = eqA;
                needsUpdate = true;
            }

            if (isSchedule(eqB)) {
                if (!dhc && (/^\d{4}-\d{2}-\d{2}/.test(eqB) || /^\d{1,2}\/\d{1,2}/.test(eqB))) {
                    dhc = eqB;
                }
                eqB = 'A definir';
                patchPayload.equipa_b = eqB;
                needsUpdate = true;
            }

            if (dhc !== (m.data_hora_campo || '')) {
                patchPayload.data_hora_campo = dhc;
                needsUpdate = true;
            }

            if (needsUpdate) {
                const patchUrl = `${SUPABASE_URL}/rest/v1/torneiosfpp_matches?id=eq.${m.id}`;
                await fetchWithRetry(patchUrl, {
                    method: 'PATCH',
                    headers,
                    body: JSON.stringify(patchPayload)
                });
                totalCorrigidos++;
            }
        }

        console.log(`   ⏳ Analisados ${totalAnalisados} jogos (${totalCorrigidos} corrigidos até agora)...`);
        offset += PAGE_SIZE;

        if (matches.length < PAGE_SIZE) break;
    }

    // 3. DESDUPLICAR TORNEIOS COM O MESMO URL_TIEPADEL
    console.log("\n3️⃣  A verificar e eliminar torneios duplicados (mesmo url_tiepadel)...");
    try {
        const resTorneios = await fetchWithRetry(`${SUPABASE_URL}/rest/v1/torneiosfpp?url_tiepadel=not.is.null&select=id,fpp_id,nome,url_tiepadel,updated_at`, { headers });
        if (resTorneios && resTorneios.ok) {
            const listaTorneios = await resTorneios.json();
            const urlGroups = new Map();

            for (const t of listaTorneios) {
                const normUrl = t.url_tiepadel.trim().toLowerCase().replace(/\/+$/, '');
                if (!urlGroups.has(normUrl)) urlGroups.set(normUrl, []);
                urlGroups.get(normUrl).push(t);
            }

            let totalEliminados = 0;
            for (const [normUrl, grupo] of urlGroups.entries()) {
                if (grupo.length > 1) {
                    // Avaliar duplas de cada registo
                    const avaliados = [];
                    for (const t of grupo) {
                        const resDuplas = await fetchWithRetry(`${SUPABASE_URL}/rest/v1/torneiosfpp_duplas?torneio_id=eq.${encodeURIComponent(t.fpp_id)}&select=id`, { headers });
                        const duplas = (resDuplas && resDuplas.ok) ? await resDuplas.json() : [];
                        avaliados.push({ ...t, qtdDuplas: duplas.length });
                    }

                    // Ordena: o melhor fica primeiro (mais duplas; se empate, mais recente)
                    avaliados.sort((a, b) => {
                        if (b.qtdDuplas !== a.qtdDuplas) return b.qtdDuplas - a.qtdDuplas;
                        return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
                    });

                    const principal = avaliados[0];
                    const duplicados = avaliados.slice(1);

                    for (const dup of duplicados) {
                        // Se o duplicado tem 0 duplas ou menos que o principal, podemos apagar com segurança
                        if (dup.qtdDuplas === 0 || dup.qtdDuplas <= principal.qtdDuplas) {
                            console.log(`   🗑️ A eliminar torneio fantasma: [${dup.fpp_id}] "${dup.nome}" (Duplas: ${dup.qtdDuplas}) a favor de [${principal.fpp_id}] (Duplas: ${principal.qtdDuplas})`);
                            await fetchWithRetry(`${SUPABASE_URL}/rest/v1/torneiosfpp?id=eq.${dup.id}`, {
                                method: 'DELETE',
                                headers
                            });
                            totalEliminados++;
                        }
                    }
                }
            }
            console.log(`   ✅ Higienização concluída: ${totalEliminados} torneios duplicados eliminados.`);
        }
    } catch (dedupErr) {
        console.error("   ❌ Erro ao desduplicar torneios:", dedupErr.message);
    }

    console.log("\n==========================================================");
    console.log(`🏆 Limpeza Concluída!`);
    console.log(`   • Total de jogos analisados: ${totalAnalisados}`);
    console.log(`   • Total de jogos corrigidos: ${totalCorrigidos}`);
    console.log("==========================================================");
    process.exit(0);
})();
