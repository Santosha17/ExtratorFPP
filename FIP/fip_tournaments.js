require('dotenv').config({ path: '../.env' });
if (!process.env.SUPABASE_URL_SN_LIGA) {
    require('dotenv').config();
}

// Compatibilidade para Node.js < 22 (evita erro de WebSocket no Supabase Realtime)
if (typeof globalThis.WebSocket === 'undefined') {
    globalThis.WebSocket = class DummyWebSocket {};
}

const { createClient } = require('@supabase/supabase-js');

// --- CONFIGURAÇÕES DO SUPABASE ---
const SUPABASE_URL = process.env.SUPABASE_URL_SN_LIGA;
const SUPABASE_KEY = process.env.SUPABASE_KEY_SN_LIGA;

if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error("❌ ERRO: Credenciais do Supabase não encontradas no ficheiro .env!");
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false },
    realtime: { transport: globalThis.WebSocket }
});

const FIP_API = 'https://api-toledo.matchscorerlive.com/api';
const FIP_HEADERS = {
    'accept': '*/*',
    'falstaff-key': '68F1FAA8CA8643589F5FC96EE96AD0EE'
};

// -----------------------------------------------------------------------------
// MAPEAMENTO E TRADUÇÃO DE RONDAS E CATEGORIAS
// -----------------------------------------------------------------------------

function determinarRonda(matchId, roundName, competitionType) {
    if (competitionType === 'RR') {
        return 'Fase de Grupos';
    }

    if (roundName) {
        const mapa = {
            'F': 'Final',
            'SF': 'Meias-finais',
            'QF': 'Quartos-de-final',
            'R16': 'Oitavos-de-final',
            'R32': '1/16 Final',
            'R64': '1/32 Final',
            'Q1': 'Ronda 1 Qualificação',
            'Q2': 'Ronda 2 Qualificação',
            'Q3': 'Ronda Final Qualificação'
        };
        if (mapa[roundName]) return mapa[roundName];
    }

    if (!matchId) return 'Quadro';

    // Extrai o número do matchId (ex: MD016 -> 16, MD001 -> 1)
    const numMatch = matchId.match(/\d+/);
    if (!numMatch) return roundName || 'Quadro';
    const num = parseInt(numMatch[0], 10);

    const isQuali = matchId.toUpperCase().includes('Q') || matchId.startsWith('J') || matchId.startsWith('K');

    if (isQuali) {
        // Na qualificação KO (ex: quadro de 16 com 4 apurados):
        // 4 a 7 -> Ronda Final de Acesso à fase seguinte
        // 8 a 15 -> Ronda 1 (ou Ronda 2 num quadro de 32)
        // 16 a 31 -> Ronda 1
        if (num <= 7) return 'Ronda Final Qualificação';
        if (num <= 15) return 'Ronda 1 Qualificação';
        if (num <= 31) return 'Ronda 1 Qualificação';
        return 'Qualificação';
    }

    if (num === 1) return 'Final';
    if (num <= 3) return 'Meias-finais';
    if (num <= 7) return 'Quartos-de-final';
    if (num <= 15) return 'Oitavos-de-final';
    if (num <= 31) return '1/16 Final';
    if (num <= 63) return '1/32 Final';

    return roundName || 'Quadro';
}

function mapearDrawParaCategoria(drawType, drawName = '') {
    const dt = (drawType || '').toUpperCase();

    // Seniores / FIP Tour
    if (dt === 'MD') return { categoria: 'Masculinos 1', fase: 'Quadro Principal' };
    if (dt === 'MQ') return { categoria: 'Masculinos 1', fase: 'Qualificação' };
    if (dt === 'WD') return { categoria: 'Femininos 1', fase: 'Quadro Principal' };
    if (dt === 'WQ') return { categoria: 'Femininos 1', fase: 'Qualificação' };

    // FIP Promises (Sub-12, Sub-14, Sub-16, Sub-18)
    const promisesMap = {
        'B2': { categoria: 'Masculinos SUB12', fase: 'Quadro Principal' },
        'J2': { categoria: 'Masculinos SUB12', fase: 'Qualificação' },
        'B4': { categoria: 'Masculinos SUB14', fase: 'Quadro Principal' },
        'J4': { categoria: 'Masculinos SUB14', fase: 'Qualificação' },
        'B6': { categoria: 'Masculinos SUB16', fase: 'Quadro Principal' },
        'J6': { categoria: 'Masculinos SUB16', fase: 'Qualificação' },
        'B8': { categoria: 'Masculinos SUB18', fase: 'Quadro Principal' },
        'J8': { categoria: 'Masculinos SUB18', fase: 'Qualificação' },
        'G2': { categoria: 'Femininos SUB12', fase: 'Quadro Principal' },
        'K2': { categoria: 'Femininos SUB12', fase: 'Qualificação' },
        'G4': { categoria: 'Femininos SUB14', fase: 'Quadro Principal' },
        'K4': { categoria: 'Femininos SUB14', fase: 'Qualificação' },
        'G6': { categoria: 'Femininos SUB16', fase: 'Quadro Principal' },
        'K6': { categoria: 'Femininos SUB16', fase: 'Qualificação' },
        'G8': { categoria: 'Femininos SUB18', fase: 'Quadro Principal' },
        'K8': { categoria: 'Femininos SUB18', fase: 'Qualificação' }
    };

    if (promisesMap[dt]) return promisesMap[dt];

    return {
        categoria: drawName || dt,
        fase: dt.includes('Q') ? 'Qualificação' : 'Quadro Principal'
    };
}

function formatarEquipa(team, isByeMatch = false) {
    if (!team) return isByeMatch ? 'BYE' : 'A definir';
    if (team.status === 'BYE') return 'BYE';

    const p1 = team.player ? `${team.player.firstName || ''} ${team.player.lastName || ''}`.trim() : '';
    const p2 = team.partner ? `${team.partner.firstName || ''} ${team.partner.lastName || ''}`.trim() : '';

    if (p1 && p2) return `${p1} / ${p2}`;
    if (p1 || p2) return p1 || p2;

    // Vagas de qualificação pendentes (não são BYE, são jogos a realizar)
    if (team.status === 'Q/LL' || team.status === 'Q' || team.status === 'LL') {
        return 'Qualificado (Q)';
    }

    if (isByeMatch) return 'BYE';
    return team.status || 'A definir';
}

function normalizarTexto(str) {
    return (str || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

// -----------------------------------------------------------------------------
// FUNÇÃO PRINCIPAL DE SINCRONIZAÇÃO
// -----------------------------------------------------------------------------

async function sincronizarFIPParaTabelasFPP(torneioFppId, fipEventCode, ano = 2026, options = {}) {
    console.log(`\n========================================================`);
    console.log(`🎾 A sincronizar Torneio [${torneioFppId}] com Evento FIP [${fipEventCode}] (${ano})...`);
    console.log(`========================================================`);

    // 1. Obter detalhes do torneio na API FIP
    let tournamentInfo = null;
    try {
        const resInfo = await fetch(`${FIP_API}/tournament/FIP/${ano}/${fipEventCode}`, { headers: FIP_HEADERS });
        if (resInfo.ok) {
            tournamentInfo = await resInfo.json();
            console.log(`📍 Torneio FIP: "${tournamentInfo.name}" | Cidade: ${tournamentInfo.city}`);
        }
    } catch (e) {
        console.warn(`⚠️ Não foi possível obter detalhes do torneio ${fipEventCode}:`, e.message);
    }

    // 2. DUPLAS (Inscrições)
    console.log(`\n👥 [1/2] A carregar Duplas / Inscrições...`);
    let categoriasDuplas = new Set();
    const resPlayers = await fetch(`${FIP_API}/players/FIP/${ano}/${fipEventCode}`, { headers: FIP_HEADERS });

    if (resPlayers.ok) {
        const playersData = await resPlayers.json();
        console.log(`   Recebidos ${playersData.length} registos da FIP.`);

        const duplasParaInserir = playersData
            .filter(item => item.team && (item.team.player || item.team.partner))
            .map(item => {
                const mapeamento = mapearDrawParaCategoria(item.drawType);
                categoriasDuplas.add(mapeamento.categoria);

                const player = item.team?.player;
                const partner = item.team?.partner;

                const nomeA = player ? `${player.firstName || ''} ${player.lastName || ''}`.trim() : '';
                const nomeB = partner ? `${partner.firstName || ''} ${partner.lastName || ''}`.trim() : '';

                const seedVal = item.seed || item.team?.seed;
                const cabecaSerie = (seedVal && seedVal !== '0' && seedVal !== 0) ? String(seedVal) : null;

                return {
                    torneio_id: String(torneioFppId),
                    categoria: mapeamento.categoria,
                    fase: mapeamento.fase,
                    cabeca_serie: cabecaSerie,
                    nome_a: nomeA,
                    licenca_a: player?.id || null,
                    pontos_a: String(player?.doublesRank || player?.singlesRank || 0),
                    nome_b: nomeB,
                    licenca_b: partner?.id || null,
                    pontos_b: String(partner?.doublesRank || partner?.singlesRank || 0)
                };
            });

        if (duplasParaInserir.length > 0) {
            const categoriasArray = Array.from(categoriasDuplas);

            // Limpa apenas as categorias deste evento FIP e eventuais duplicados obsoletos
            const categoriasParaLimpar = [...categoriasArray];
            if (categoriasArray.includes('Masculinos 1') || categoriasArray.includes('M1')) categoriasParaLimpar.push('Masculinos', 'M1', 'Masculinos 1');
            if (categoriasArray.includes('Femininos 1') || categoriasArray.includes('F1')) categoriasParaLimpar.push('Femininos', 'F1', 'Femininos 1');

            const { error: delErr } = await supabase
                .from('torneiosfpp_duplas')
                .delete()
                .eq('torneio_id', String(torneioFppId))
                .in('categoria', categoriasParaLimpar);

            if (delErr) {
                console.warn(`   ⚠️ Aviso ao limpar duplas anteriores:`, delErr.message);
            }

            // Inserção em lotes de 100
            for (let i = 0; i < duplasParaInserir.length; i += 100) {
                const chunk = duplasParaInserir.slice(i, i + 100);
                const { error: insErr } = await supabase.from('torneiosfpp_duplas').insert(chunk);
                if (insErr) {
                    console.error(`   ❌ Erro ao inserir lote de duplas:`, insErr.message);
                }
            }
            console.log(`   ✅ ${duplasParaInserir.length} duplas inseridas com sucesso nas categorias: ${categoriasArray.join(', ')}`);
        } else {
            console.log(`   ℹ️ Nenhuma dupla inscrita encontrada para este torneio.`);
        }
    } else {
        console.log(`   ℹ️ Endpoint de jogadores não disponível (Status: ${resPlayers.status})`);
    }

    // 3. QUADROS E JOGOS (Matches)
    console.log(`\n🎾 [2/2] A carregar Quadros e Jogos...`);

    // Descobrir quais os draws disponíveis para este torneio
    let drawsToFetch = [];
    if (tournamentInfo && Array.isArray(tournamentInfo.draws) && tournamentInfo.draws.length > 0) {
        drawsToFetch = tournamentInfo.draws;
    } else {
        // Fallback padrão para torneios seniores
        drawsToFetch = [
            { type: 'MD', name: "Men's Doubles", competitionType: 'KO' },
            { type: 'MQ', name: "Men's Qualifying", competitionType: 'KO' },
            { type: 'WD', name: "Women's Doubles", competitionType: 'KO' },
            { type: 'WQ', name: "Women's Qualifying", competitionType: 'KO' }
        ];
    }

    // Limpar previamente todos os jogos deste evento FIP de uma só vez (sem apagar quadros entre si)
    const categoriasParaLimparMatches = new Set(['Masculinos 1', 'Masculinos', 'M1', 'Femininos 1', 'Femininos', 'F1']);
    for (const d of drawsToFetch) {
        const m = mapearDrawParaCategoria(d.type, d.name);
        categoriasParaLimparMatches.add(m.categoria);
    }

    const { error: delMatchesErr } = await supabase
        .from('torneiosfpp_matches')
        .delete()
        .eq('torneio_id', String(torneioFppId))
        .in('categoria', Array.from(categoriasParaLimparMatches));

    if (delMatchesErr) {
        console.warn(`   ⚠️ Aviso ao limpar jogos anteriores:`, delMatchesErr.message);
    }

    let categoriasMatches = new Set();
    let totalJogosInseridos = 0;

    for (const draw of drawsToFetch) {
        const drawType = draw.type;
        const mapeamento = mapearDrawParaCategoria(drawType, draw.name);
        categoriasMatches.add(mapeamento.categoria);

        try {
            const resDraw = await fetch(`${FIP_API}/draws/FIP/${ano}/${fipEventCode}/${drawType}`, { headers: FIP_HEADERS });
            if (!resDraw.ok) continue;

            const drawData = await resDraw.json();
            if (!drawData.matches || drawData.matches.length === 0) continue;

            const compType = draw.competitionType || drawData.competitionFormat || 'KO';

            const matchesParaInserir = drawData.matches.map(m => {
                const isBye = !!m.isBye;
                const equipaA = formatarEquipa(m.team1, isBye);
                const equipaB = formatarEquipa(m.team2, isBye);

                const rondaTraduzida = determinarRonda(m.matchId, m.roundName, compType);
                const scoreLimpo = (m.score && m.score.trim().length > 0) ? m.score.trim() : null;

                return {
                    torneio_id: String(torneioFppId),
                    categoria: mapeamento.categoria,
                    fase: mapeamento.fase,
                    ronda: rondaTraduzida,
                    equipa_a: equipaA,
                    equipa_b: equipaB,
                    resultado: scoreLimpo,
                    data_hora_campo: m.courtName || null
                };
            });

            if (matchesParaInserir.length > 0) {
                // Inserção em lotes de 100
                for (let i = 0; i < matchesParaInserir.length; i += 100) {
                    const chunk = matchesParaInserir.slice(i, i + 100);
                    const { error: insErr } = await supabase.from('torneiosfpp_matches').insert(chunk);
                    if (insErr) {
                        console.error(`   ❌ Erro ao inserir jogos de ${drawType}:`, insErr.message);
                    }
                }

                totalJogosInseridos += matchesParaInserir.length;
                console.log(`   ✓ [${drawType}] ${matchesParaInserir.length} jogos guardados (${mapeamento.categoria} - ${mapeamento.fase}).`);
            }
        } catch (err) {
            console.warn(`   ⚠️ Erro ao processar quadro ${drawType}:`, err.message);
        }
    }

    console.log(`\n🎉 Concluído para [${torneioFppId}]: Total de ${totalJogosInseridos} jogos processados.`);

    // 4. Atualiza o fip_event_code e datas no registo do torneio
    try {
        const updatePayload = { fip_event_code: fipEventCode };
        if (tournamentInfo && tournamentInfo.startDate) {
            const dFip = new Date(tournamentInfo.startDate);
            if (!isNaN(dFip.getTime())) {
                const yyyy = dFip.getFullYear();
                const mm = String(dFip.getMonth() + 1).padStart(2, '0');
                const dd = String(dFip.getDate()).padStart(2, '0');
                updatePayload.data_inicio = `${yyyy}-${mm}-${dd}`;
            }
        }
        await supabase
            .from('torneiosfpp')
            .update(updatePayload)
            .eq('fpp_id', String(torneioFppId));
    } catch (e) {
        // ignora se falhar
    }

    // 5. Tenta enriquecer com Horários e Campos da Order of Play oficial (PDFs no site da FIP)
    try {
        const { spawnSync } = require('child_process');
        const path = require('path');
        const oopScript = path.resolve(__dirname, 'fip_order_of_play.py');
        if (tournamentInfo && tournamentInfo.name) {
            const nomeNorm = normalizarTexto(tournamentInfo.name).replace(/\s+/g, '-');
            const slug = `${nomeNorm}-${ano}`;
            console.log(`\n🕒 A verificar Order of Play no site padelfip.com (${slug})...`);
            const pyCmd = process.platform === 'win32' ? 'python' : 'python3';
            const proc = spawnSync(pyCmd, [oopScript, String(torneioFppId), slug, tournamentInfo.name], {
                encoding: 'utf-8',
                timeout: 30000
            });
            if (proc.stdout) {
                console.log(proc.stdout.trim());
            }
            if (proc.stderr && proc.stderr.trim()) {
                console.warn(`   ⚠️ Detalhe Order of Play:`, proc.stderr.trim());
            }
        }
    } catch (oopErr) {
        console.warn(`   ⚠️ Aviso ao verificar Order of Play:`, oopErr.message);
    }

    return { totalJogosInseridos, duplasCategorias: Array.from(categoriasDuplas) };
}

// -----------------------------------------------------------------------------
// ROTINA DE CORRESPONDÊNCIA AUTOMÁTICA (AUTO-MATCH)
// -----------------------------------------------------------------------------

const ALIASES_CIDADES = {
    'oporto': ['porto', 'matosinhos'],
    'acores': ['acores', 'ponta delgada', 'sao miguel'],
    'madeira': ['madeira', 'funchal'],
    'sao joao da madeira': ['sao joao da madeira'],
    'lisboa': ['lisboa', 'oeiras', 'expo', 'racket centre'],
    'vila real de santo antonio': ['vila real', 'vrsa']
};

function calcularScoreCorrespondencia(fip, db) {
    const fipNome = normalizarTexto(fip.name);
    const fipCidade = normalizarTexto(fip.city);
    const dbNome = normalizarTexto(db.nome);

    let score = 0;

    // Se já tem o fip_event_code exato
    if (db.fip_event_code === fip.eventCode) return 1000;

    // Tipo de torneio tem de bater certo (Promises vs Torneio Sénior)
    const fipIsPromises = fipNome.includes('promises');
    const dbIsPromises = dbNome.includes('promises');
    if (fipIsPromises !== dbIsPromises) return -100;

    // Distinção expressa: São João da Madeira vs Ilha da Madeira
    const fipIsSJM = fipNome.includes('sao joao') || fipCidade.includes('sao joao');
    const dbIsSJM = dbNome.includes('sao joao');
    if (fipIsSJM !== dbIsSJM) {
        return -100; // Impede que um torneio de São João da Madeira seja associado à Madeira e vice-versa
    }
    if (fipIsSJM && dbIsSJM) {
        score += 50;
    }

    // Escalão de categoria
    const tiers = ['platinum', 'gold', 'silver', 'bronze', 'promises'];
    for (const tier of tiers) {
        if (fipNome.includes(tier) && dbNome.includes(tier)) score += 30;
    }

    // Cidade
    if (fipCidade && dbNome.includes(fipCidade)) {
        score += 40;
    } else if (ALIASES_CIDADES[fipCidade]) {
        for (const alias of ALIASES_CIDADES[fipCidade]) {
            if (dbNome.includes(alias)) {
                score += 35;
                break;
            }
        }
    }

    // Palavras distintivas (ex: "matosinhos", "mimosa", "almeirim", "elvas", "trofa", "coina")
    const palavras = fipNome.split(' ').filter(p => p.length >= 5 && !['promises', 'continental', 'hospital', 'master', 'tour'].includes(p));
    for (const p of palavras) {
        if (dbNome.includes(p)) score += 25;
    }

    // Proximidade de data (se disponível)
    if (fip.startDate && db.data_inicio) {
        const dFip = new Date(fip.startDate);
        const dDb = new Date(db.data_inicio);
        const diffDias = Math.abs((dFip - dDb) / (1000 * 60 * 60 * 24));
        if (diffDias <= 7) score += 25;
        else if (diffDias <= 30) score += 10;
    }

    return score;
}

async function sincronizarTodosTorneiosFip(ano = 2026, apenasMapear = false) {
    console.log(`\n========================================================`);
    console.log(`🌍 A procurar todos os torneios FIP em Portugal para o ano ${ano}...`);
    console.log(`========================================================`);

    const res = await fetch(`${FIP_API}/tournaments/FIP/${ano}`, { headers: FIP_HEADERS });
    if (!res.ok) {
        console.error(`❌ Erro ao aceder à API da FIP: ${res.status}`);
        return;
    }

    const todosTorneiosFip = await res.json();
    const torneiosPortugalFip = todosTorneiosFip.filter(t => t.countryCode === 'POR' || (t.country && t.country.toLowerCase().includes('portugal')));
    console.log(`✓ Encontrados ${torneiosPortugalFip.length} torneios FIP agendados para Portugal em ${ano}.\n`);

    const { data: dbTorneios, error: dbErr } = await supabase
        .from('torneiosfpp')
        .select('id, fpp_id, nome, fip_event_code, data_inicio, data_fim');

    if (dbErr) {
        console.error(`❌ Erro ao ler tabela torneiosfpp:`, dbErr.message);
        return;
    }

    let correspondidos = 0;

    for (const fip of torneiosPortugalFip) {
        // Encontra o melhor candidato na BD
        let melhorCandidato = null;
        let melhorScore = 0;

        for (const db of dbTorneios) {
            const score = calcularScoreCorrespondencia(fip, db);
            if (score > melhorScore) {
                melhorScore = score;
                melhorCandidato = db;
            }
        }

        if (melhorCandidato && melhorScore >= 40) {
            correspondidos++;
            console.log(`📌 [${fip.eventCode}] "${fip.name}" (${fip.city})`);
            console.log(`   ↳ Associado a: [${melhorCandidato.fpp_id}] "${melhorCandidato.nome}" (Score: ${melhorScore})`);

            // Atualiza fip_event_code se ainda não o tiver
            if (melhorCandidato.fip_event_code !== fip.eventCode) {
                await supabase
                    .from('torneiosfpp')
                    .update({ fip_event_code: fip.eventCode })
                    .eq('id', melhorCandidato.id);
            }

            if (!apenasMapear) {
                await sincronizarFIPParaTabelasFPP(melhorCandidato.fpp_id, fip.eventCode, ano);
            }
        } else {
            console.log(`⚠️ Sem correspondência direta na BD: [${fip.eventCode}] "${fip.name}" (${fip.city})`);
        }
    }

    console.log(`\n🏁 Processo concluído: ${correspondidos}/${torneiosPortugalFip.length} torneios associados.`);
}

// -----------------------------------------------------------------------------
// EXECUÇÃO CLI
// -----------------------------------------------------------------------------

async function main() {
    const args = process.argv.slice(2);
    const getArg = (name) => {
        const arg = args.find(a => a.startsWith(`--${name}=`));
        return arg ? arg.split('=').slice(1).join('=') : null;
    };

    const argTorneio = getArg('torneio') || getArg('id');
    const argEvent = getArg('event') || getArg('code');
    const argAno = parseInt(getArg('ano') || '2026', 10);
    const argApenasMapear = args.includes('--mapear') || args.includes('--match-only');
    const argTodos = args.includes('--todos') || args.includes('--auto') || args.includes('--all');

    if (argTorneio && argEvent) {
        // Modo 1: Torneio específico especificado
        await sincronizarFIPParaTabelasFPP(argTorneio, argEvent, argAno);
    } else if (argEvent && !argTorneio) {
        // Procura pelo event_code na base de dados
        const { data: found } = await supabase
            .from('torneiosfpp')
            .select('fpp_id, nome')
            .eq('fip_event_code', argEvent)
            .limit(1);

        if (found && found.length > 0) {
            await sincronizarFIPParaTabelasFPP(found[0].fpp_id, argEvent, argAno);
        } else {
            console.log(`ℹ️ Evento [${argEvent}] não encontrado na coluna fip_event_code. A tentar auto-match...`);
            await sincronizarTodosTorneiosFip(argAno, false);
        }
    } else if (argTodos || argApenasMapear) {
        // Modo 2: Todos os torneios em Portugal
        await sincronizarTodosTorneiosFip(argAno, argApenasMapear);
    } else {
        console.log(`
🎾 EXTRATOR / SINCRONIZADOR DE TORNEIOS FIP PARA TABELAS FPP
------------------------------------------------------------
Uso:
  1. Sincronizar um torneio específico:
     node FIP/fip_tournaments.js --torneio=<fpp_id> --event=<fip_code> [--ano=2026]
     Exemplo:
     node FIP/fip_tournaments.js --torneio=2026-02-04-fip-bronze-madeira-fpp --event=0602

  2. Sincronizar e mapear TODOS os torneios FIP em Portugal:
     node FIP/fip_tournaments.js --todos [--ano=2026]

  3. Apenas associar os fip_event_code na BD sem transferir jogos:
     node FIP/fip_tournaments.js --todos --mapear
------------------------------------------------------------
        `);
    }
}

if (require.main === module) {
    main().catch(err => {
        console.error("❌ Erro fatal:", err);
        process.exit(1);
    });
}

module.exports = {
    sincronizarFIPParaTabelasFPP,
    sincronizarTodosTorneiosFip,
    determinarRonda,
    mapearDrawParaCategoria
};