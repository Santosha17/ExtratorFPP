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

    console.log("\n==========================================================");
    console.log(`🏆 Limpeza Concluída!`);
    console.log(`   • Total de jogos analisados: ${totalAnalisados}`);
    console.log(`   • Total de jogos corrigidos: ${totalCorrigidos}`);
    console.log("==========================================================");
    process.exit(0);
})();
