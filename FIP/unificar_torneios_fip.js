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

const headersSupabase = {
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json'
};

const delay = (ms) => new Promise(r => setTimeout(r, ms));

async function fetchJson(url, options = {}) {
    const res = await fetch(url, { headers: headersSupabase, ...options });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`HTTP ${res.status}: ${text}`);
    }
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('application/json')) {
        return res.json();
    }
    return null;
}

function normalize(s) {
    if (!s) return "";
    return s
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

// Extrai palavras-chave essenciais de um torneio FIP para agrupamento
function extrairChaveAgrupamento(t) {
    const nomeRaw = t.nome || '';
    const nomeNorm = normalize(nomeRaw);
    const fppId = (t.fpp_id || '').toLowerCase();
    const clubeNorm = normalize(t.clube_nome || '');
    const moradaNorm = normalize(t.clube_morada || '');
    const comb = `${nomeNorm} ${clubeNorm} ${moradaNorm}`;

    // Deve ser genuinamente um torneio FIP no nome ou no fpp_id
    const isFip = nomeNorm.includes('fip') || fppId.includes('fip');
    if (!isFip) {
        return null; // Ignora torneios nacionais normais
    }

    let tier = 'tour';
    if (comb.includes('promises')) tier = 'promises';
    else if (comb.includes('platinum')) tier = 'platinum';
    else if (comb.includes('gold')) tier = 'gold';
    else if (comb.includes('silver')) tier = 'silver';
    else if (comb.includes('bronze')) tier = 'bronze';
    else if (comb.includes('veteranos')) tier = 'vet';
    else if (comb.includes('jovens') || comb.includes('europeu')) tier = 'jovens';

    const cidades = [
        'oeiras', 'porto', 'matosinhos', 'almeirim', 'viseu', 'trofa',
        'elvas', 'setubal', 'pinhal novo', 'vilamoura', 'albufeira',
        'coimbra', 'sao joao da madeira', 'paredes', 'caldas da rainha',
        'mafra', 'santarem', 'ericeira', 'portimao', 'lisboa', 'ponta delgada',
        'madeira', 'funchal', 'vila real de santo antonio', 'vrsa', 'guimaraes', 'aveiro'
    ];

    let local = 'geral';
    for (const c of cidades) {
        if (comb.includes(c)) {
            local = c;
            break;
        }
    }

    let anoMes = '2026';
    if (t.data_inicio) {
        anoMes = t.data_inicio.substring(0, 7);
    } else if (t.data_corrida) {
        for (const m of ['jan', 'fev', 'feb', 'mar', 'abr', 'apr', 'mai', 'may', 'jun', 'jul', 'ago', 'aug', 'set', 'sep', 'out', 'oct', 'nov', 'dez', 'dec']) {
            if (t.data_corrida.toLowerCase().includes(m)) {
                anoMes = `2026-${m}`;
                break;
            }
        }
    }

    return `${anoMes}_${tier}_${local}`;
}

async function unificarTorneiosFip(dryRun = false) {
    console.log(`==========================================================`);
    console.log(`🧹 UNIFICADOR DE TORNEIOS FIP DUPLICADOS (DryRun: ${dryRun})`);
    console.log(`==========================================================\n`);

    // 1. Obter todos os torneios FIP da base de dados
    const torneios = await fetchJson(`${SUPABASE_URL}/rest/v1/torneiosfpp?or=(nome.ilike.*fip*,fpp_id.ilike.*fip*)&select=*`);
    console.log(`📋 Total de torneios FIP na BD: ${torneios.length}`);

    // 2. Agrupar torneios pelo identificador FIP ou por proximidade de data e local
    const grupos = new Map();

    for (const t of torneios) {
        const chave = extrairChaveAgrupamento(t);
        if (chave) {
            if (!grupos.has(chave)) grupos.set(chave, []);
            grupos.get(chave).push(t);
        }
    }

    const gruposConsolidados = [];
    for (const [chave, lista] of grupos.entries()) {
        if (lista.length > 1) {
            gruposConsolidados.push(lista);
        }
    }

    console.log(`🔍 Encontrados ${gruposConsolidados.length} pares/grupos de torneios FIP duplicados:\n`);

    let totalFundidos = 0;

    for (let i = 0; i < gruposConsolidados.length; i++) {
        const duplicados = gruposConsolidados[i];
        console.log(`----------------------------------------------------------`);
        console.log(`👉 [Grupo ${i + 1}/${gruposConsolidados.length}] (${duplicados.length} registos):`);

        // Critérios de prioridade para o canónico:
        duplicados.sort((a, b) => {
            let scoreA = 0;
            let scoreB = 0;

            if (a.url_tiepadel) scoreA += 50;
            if (b.url_tiepadel) scoreB += 50;

            if (a.fip_event_code) scoreA += 30;
            if (b.fip_event_code) scoreB += 30;

            if (a.data_corrida) scoreA += 20;
            if (b.data_corrida) scoreB += 20;

            if (a.lat && a.lng) scoreA += 10;
            if (b.lat && b.lng) scoreB += 10;

            // Preferir o nome mais limpo/curto oficial
            if (a.nome && a.nome.length < b.nome.length) scoreA += 5;
            if (b.nome && b.nome.length < a.nome.length) scoreB += 5;

            return scoreB - scoreA;
        });

        const canonico = duplicados[0];
        const secundarios = duplicados.slice(1);

        console.log(`   ⭐ CANÓNICO A MANTER: [${canonico.fpp_id}] "${canonico.nome}"`);
        console.log(`      url_tiepadel: ${canonico.url_tiepadel || 'N/D'} | fip_code: ${canonico.fip_event_code || 'N/D'}`);

        // Fundir os melhores dados dos secundários para o canónico
        const dadosAtualizar = {};

        for (const sec of secundarios) {
            console.log(`   ❌ SECUNDÁRIO A REMOVER: [${sec.fpp_id}] "${sec.nome}"`);

            if (!canonico.url_tiepadel && sec.url_tiepadel) dadosAtualizar.url_tiepadel = sec.url_tiepadel;
            if (!canonico.fip_event_code && sec.fip_event_code) dadosAtualizar.fip_event_code = sec.fip_event_code;
            if (!canonico.data_corrida && sec.data_corrida) dadosAtualizar.data_corrida = sec.data_corrida;
            if (!canonico.data_inicio && sec.data_inicio) dadosAtualizar.data_inicio = sec.data_inicio;
            if (!canonico.data_fim && sec.data_fim) dadosAtualizar.data_fim = sec.data_fim;
            if (!canonico.clube_nome && sec.clube_nome) dadosAtualizar.clube_nome = sec.clube_nome;
            if (!canonico.clube_morada && sec.clube_morada) dadosAtualizar.clube_morada = sec.clube_morada;
            if (!canonico.lat && sec.lat) { dadosAtualizar.lat = sec.lat; dadosAtualizar.lng = sec.lng; }
            if (!canonico.categorias && sec.categorias) dadosAtualizar.categorias = sec.categorias;
            if (!canonico.classe && sec.classe) dadosAtualizar.classe = sec.classe;
            if (!canonico.ano && sec.ano) dadosAtualizar.ano = sec.ano;
        }

        if (!dryRun) {
            // 1. Atualizar o canónico com os campos fundidos
            if (Object.keys(dadosAtualizar).length > 0) {
                await fetchJson(`${SUPABASE_URL}/rest/v1/torneiosfpp?id=eq.${canonico.id}`, {
                    method: 'PATCH',
                    body: JSON.stringify(dadosAtualizar)
                });
                console.log(`      ✓ Canónico atualizado com campos: ${Object.keys(dadosAtualizar).join(', ')}`);
            }

            // 2. Migrar duplas e jogos dos secundários para o fpp_id canónico
            for (const sec of secundarios) {
                await fetchJson(`${SUPABASE_URL}/rest/v1/torneiosfpp_duplas?torneio_id=eq.${encodeURIComponent(sec.fpp_id)}`, {
                    method: 'PATCH',
                    body: JSON.stringify({ torneio_id: canonico.fpp_id })
                }).catch(() => {});

                await fetchJson(`${SUPABASE_URL}/rest/v1/torneiosfpp_matches?torneio_id=eq.${encodeURIComponent(sec.fpp_id)}`, {
                    method: 'PATCH',
                    body: JSON.stringify({ torneio_id: canonico.fpp_id })
                }).catch(() => {});

                // 3. Eliminar o secundário duplicado da tabela torneiosfpp
                await fetchJson(`${SUPABASE_URL}/rest/v1/torneiosfpp?id=eq.${sec.id}`, {
                    method: 'DELETE'
                });
                console.log(`      ✓ Secundário [${sec.fpp_id}] removido.`);
            }

            totalFundidos += secundarios.length;
        } else {
            console.log(`      [DRY-RUN] Seria atualizado canónico com: ${JSON.stringify(dadosAtualizar)}`);
            console.log(`      [DRY-RUN] Seriam migrados duplas/jogos e eliminados ${secundarios.length} secundários.`);
        }
    }

    console.log(`\n==========================================================`);
    console.log(`🎉 Unificação concluída! ${totalFundidos} registos duplicados fundidos e removidos.`);
    console.log(`==========================================================`);
}

if (require.main === module) {
    const isDryRun = process.argv.includes('--dry-run');
    unificarTorneiosFip(isDryRun).catch(err => {
        console.error("❌ Erro fatal:", err);
        process.exit(1);
    });
}

module.exports = { unificarTorneiosFip };
