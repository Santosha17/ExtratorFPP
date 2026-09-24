process.env.UV_THREADPOOL_SIZE = '128';
const dns = require('node:dns');
if (dns.setDefaultResultOrder) dns.setDefaultResultOrder('ipv4first');

const path = require('node:path');
const { spawn } = require('node:child_process');

require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
if (!process.env.SUPABASE_URL_SN_LIGA) {
    require('dotenv').config();
}

const SUPABASE_URL = process.env.SUPABASE_URL_SN_LIGA;
const SUPABASE_KEY = process.env.SUPABASE_KEY_SN_LIGA;

if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error("❌ ERRO: Credenciais do Supabase não encontradas no .env!");
    process.exit(1);
}

// -----------------------------------------------------------------------------
// FUSO HORÁRIO E DATAS (PORTUGAL: EUROPE/LISBON)
// -----------------------------------------------------------------------------
function getPortugalDate(offsetDays = 0) {
    const now = new Date();
    if (offsetDays !== 0) {
        now.setDate(now.getDate() + offsetDays);
    }
    const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Europe/Lisbon',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    });
    return formatter.format(now); // Formato YYYY-MM-DD
}

function getPortugalHourMinute() {
    const formatter = new Intl.DateTimeFormat('pt-PT', {
        timeZone: 'Europe/Lisbon',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    });
    return formatter.format(new Date());
}

// -----------------------------------------------------------------------------
// ANALISADOR DE DATAS DO TORNEIO (PT + EN)
// -----------------------------------------------------------------------------
const mesesMap = {
    'jan': 0, 'feb': 1, 'fev': 1, 'mar': 2, 'apr': 3, 'abr': 3,
    'may': 4, 'mai': 4, 'jun': 5, 'jul': 6, 'aug': 7, 'ago': 7,
    'sep': 8, 'set': 8, 'oct': 9, 'out': 9, 'nov': 10, 'dec': 11, 'dez': 11
};

function parseTournamentDates(torneio) {
    if (torneio.data_inicio && torneio.data_fim) {
        return {
            startStr: torneio.data_inicio,
            endStr: torneio.data_fim,
            formatted: `${torneio.data_inicio} a ${torneio.data_fim}`
        };
    }

    if (torneio.data_corrida) {
        const ano = torneio.ano || new Date().getFullYear();
        const str = torneio.data_corrida.toLowerCase().trim();
        const pad = (n) => String(n).padStart(2, '0');

        // 1. "26 Feb - 1 Mar" (meses diferentes)
        const diffMatch = str.match(/^(\d{1,2})\s+([a-z]{3})\s*-\s*(\d{1,2})\s+([a-z]{3})/i);
        if (diffMatch) {
            const d1 = parseInt(diffMatch[1], 10);
            const m1 = mesesMap[diffMatch[2].toLowerCase()];
            const d2 = parseInt(diffMatch[3], 10);
            const m2 = mesesMap[diffMatch[4].toLowerCase()];
            if (m1 !== undefined && m2 !== undefined) {
                return {
                    startStr: `${ano}-${pad(m1 + 1)}-${pad(d1)}`,
                    endStr: `${ano}-${pad(m2 + 1)}-${pad(d2)}`,
                    formatted: `${d1} ${diffMatch[2]} a ${d2} ${diffMatch[4]} ${ano}`
                };
            }
        }

        // 2. "18 - 22 Mar" (mesmo mês)
        const sameMatch = str.match(/^(\d{1,2})\s*-\s*(\d{1,2})\s+([a-z]{3})/i);
        if (sameMatch) {
            const d1 = parseInt(sameMatch[1], 10);
            const d2 = parseInt(sameMatch[2], 10);
            const m = mesesMap[sameMatch[3].toLowerCase()];
            if (m !== undefined) {
                return {
                    startStr: `${ano}-${pad(m + 1)}-${pad(d1)}`,
                    endStr: `${ano}-${pad(m + 1)}-${pad(d2)}`,
                    formatted: `${d1} a ${d2} ${sameMatch[3]} ${ano}`
                };
            }
        }

        // 3. "20 Mar" (dia único)
        const singleMatch = str.match(/^(\d{1,2})\s+([a-z]{3})/i);
        if (singleMatch) {
            const d = parseInt(singleMatch[1], 10);
            const m = mesesMap[singleMatch[2].toLowerCase()];
            if (m !== undefined) {
                const s = `${ano}-${pad(m + 1)}-${pad(d)}`;
                return {
                    startStr: s,
                    endStr: s,
                    formatted: `${d} ${singleMatch[2]} ${ano}`
                };
            }
        }
    }

    return null;
}

// -----------------------------------------------------------------------------
// CONSULTA SUPABASE
// -----------------------------------------------------------------------------
async function obterTorneiosRegistados() {
    const url = `${SUPABASE_URL}/rest/v1/torneiosfpp?url_tiepadel=not.is.null&select=fpp_id,nome,data_inicio,data_fim,data_corrida,ano&order=data_inicio.asc`;
    const res = await fetch(url, {
        headers: {
            'apikey': SUPABASE_KEY,
            'Authorization': `Bearer ${SUPABASE_KEY}`
        }
    });

    if (!res.ok) {
        throw new Error(`Falha ao consultar torneiosfpp no Supabase: ${res.statusText}`);
    }

    const torneios = await res.json();
    return (torneios || []).filter(t => !t.nome || !t.nome.toLowerCase().includes('mudum'));
}

// -----------------------------------------------------------------------------
// AVALIADORES INTELIGENTES DE NECESSIDADE DE EXECUÇÃO
// -----------------------------------------------------------------------------

// Para o LIVE WATCHER: Torneios com jogos hoje (data_inicio <= hoje <= data_fim)
function obterTorneiosComJogosHoje(torneios, todayStr) {
    return torneios.filter(t => {
        const parsed = parseTournamentDates(t);
        if (!parsed) return false;
        return (parsed.startStr <= todayStr && todayStr <= parsed.endStr);
    });
}

// Para o ENRICH: Torneios que:
// 1) Estão a decorrer hoje
// 2) OU vão começar nos próximos 3 dias (publicação de quadros/horários em vésperas)
// 3) OU terminaram ontem (consolidação final pós-torneio)
function obterTorneiosParaEnrich(torneios, todayStr) {
    const ontemStr = getPortugalDate(-1);
    const daquiATresDiasStr = getPortugalDate(3);

    return torneios.filter(t => {
        const parsed = parseTournamentDates(t);
        if (!parsed) return false;

        const emCursoHoje = (parsed.startStr <= todayStr && todayStr <= parsed.endStr);
        const quadrosProximos = (parsed.startStr > todayStr && parsed.startStr <= daquiATresDiasStr);
        const fechoOntem = (parsed.endStr === ontemStr);

        return emCursoHoje || quadrosProximos || fechoOntem;
    });
}

// -----------------------------------------------------------------------------
// EXECUTOR DE SCRIPTS FILHOS COM HERANÇA DE I/O
// -----------------------------------------------------------------------------
function executarScript(scriptName, scriptArgs = []) {
    return new Promise((resolve, reject) => {
        const scriptPath = path.resolve(__dirname, scriptName);
        console.log(`\n▶️ [AutoDispatcher] A lançar: node ${scriptName} ${scriptArgs.join(' ')}`);

        const child = spawn(process.execPath, [scriptPath, ...scriptArgs], {
            cwd: __dirname,
            stdio: 'inherit',
            env: process.env
        });

        child.on('error', (err) => {
            console.error(`🚨 [AutoDispatcher] Erro ao iniciar ${scriptName}:`, err);
            reject(err);
        });

        child.on('close', (code) => {
            if (code === 0) {
                console.log(`✅ [AutoDispatcher] ${scriptName} terminou com sucesso (exit 0).`);
                resolve(code);
            } else {
                console.error(`⚠️ [AutoDispatcher] ${scriptName} terminou com código de erro ${code}.`);
                resolve(code);
            }
        });
    });
}

// -----------------------------------------------------------------------------
// FLUXOS PRINCIPAIS
// -----------------------------------------------------------------------------
async function handleLive() {
    const todayStr = getPortugalDate();
    const hora = getPortugalHourMinute();
    console.log(`[${todayStr} ${hora}] 🔍 [AutoDispatcher:Live] A verificar se há torneios com jogos hoje...`);

    const torneios = await obterTorneiosRegistados();
    const torneiosHoje = obterTorneiosComJogosHoje(torneios, todayStr);

    if (torneiosHoje.length === 0) {
        console.log(`[${todayStr} ${hora}] ⏸️ Nenhum torneio federado com jogos agendados para hoje (${todayStr}).`);
        console.log(`   Live Watcher ignorado para poupar recursos de CPU/RAM. Até ao próximo ciclo!`);
        process.exit(0);
    }

    console.log(`[${todayStr} ${hora}] 🎾 Torneios ativos hoje (${torneiosHoje.length}):`);
    torneiosHoje.forEach(t => {
        const p = parseTournamentDates(t);
        console.log(`   • ${t.nome} (${p ? p.formatted : 'Hoje'}) [ID: ${t.fpp_id}]`);
    });

    const extraArgs = process.argv.slice(2).filter(a => a !== '--live');
    if (!extraArgs.some(a => a.startsWith('--concurrency'))) {
        extraArgs.push('--concurrency=3');
    }

    await executarScript('liveWatcherFederados.js', extraArgs);
}

async function handleEnrich() {
    const todayStr = getPortugalDate();
    const hora = getPortugalHourMinute();
    console.log(`[${todayStr} ${hora}] 🔍 [AutoDispatcher:Enrich] A verificar se há torneios para consolidar/extrair quadros...`);

    const torneios = await obterTorneiosRegistados();
    const torneiosEnrich = obterTorneiosParaEnrich(torneios, todayStr);

    if (torneiosEnrich.length === 0) {
        console.log(`[${todayStr} ${hora}] ⏸️ Nenhum torneio ativo ou em fase de publicação de quadros para hoje (${todayStr}).`);
        console.log(`   Enrich ignorado para poupar recursos. Operação concluída.`);
        process.exit(0);
    }

    console.log(`[${todayStr} ${hora}] 📋 Torneios elegíveis para enriquecimento (${torneiosEnrich.length}):`);
    torneiosEnrich.forEach(t => {
        const p = parseTournamentDates(t);
        console.log(`   • ${t.nome} (${p ? p.formatted : 'N/D'}) [ID: ${t.fpp_id}]`);
    });

    const extraArgs = process.argv.slice(2).filter(a => a !== '--enrich');
    if (!extraArgs.includes('--ativos')) extraArgs.push('--ativos');
    if (!extraArgs.some(a => a.startsWith('--concurrency'))) extraArgs.push('--concurrency=4');

    await executarScript('enrichTorneios.js', extraArgs);
}

async function handleSyncGeral() {
    console.log(`\n==========================================================`);
    console.log(`🔄 [AutoDispatcher:Sync] A iniciar Pipeline Semanal Completo...`);
    console.log(`==========================================================`);

    // 1. Baixar PDF oficial e atualizar torneiosfpp
    await executarScript('syncFPP.js');

    // 2. Reconciliar com o calendário Tiepadel (obter url_tiepadel)
    await executarScript('updateCalendario.js');

    // 3. Extrair coordenadas GPS, morada detalhada, regulamento e árbitro
    await executarScript('updateCoordenadas.js');

    // 4. Higienizar tabela de torneios (remover Bye e arrumar resultados)
    await executarScript('limparDadosFederados.js');

    console.log(`\n🏁 [AutoDispatcher:Sync] Pipeline Semanal concluído com êxito!`);
}

async function handleStatus() {
    const todayStr = getPortugalDate();
    const hora = getPortugalHourMinute();
    console.log("==========================================================");
    console.log(`📊 STATUS DO SISTEMA FEDERADOS FPP - ${todayStr} às ${hora} (Fuso Lisboa)`);
    console.log("==========================================================");

    const torneios = await obterTorneiosRegistados();
    const torneiosHoje = obterTorneiosComJogosHoje(torneios, todayStr);
    const torneiosEnrich = obterTorneiosParaEnrich(torneios, todayStr);

    console.log(`\n🎾 TORNEIOS COM JOGOS HOJE (Ativam o Live Watcher): ${torneiosHoje.length}`);
    if (torneiosHoje.length > 0) {
        torneiosHoje.forEach(t => {
            const p = parseTournamentDates(t);
            console.log(`   ✅ [LIVE ATIVO] ${t.nome} (${p?.formatted})`);
        });
    } else {
        console.log(`   💤 Nenhum torneio hoje. O Live Watcher não corre.`);
    }

    console.log(`\n📋 TORNEIOS ELEGÍVEIS PARA ENRICH (Ativam o enrichTorneios): ${torneiosEnrich.length}`);
    if (torneiosEnrich.length > 0) {
        torneiosEnrich.forEach(t => {
            const p = parseTournamentDates(t);
            console.log(`   ✅ [ENRICH ATIVO] ${t.nome} (${p?.formatted})`);
        });
    } else {
        console.log(`   💤 Nenhum torneio na janela de enriquecimento hoje.`);
    }

    console.log("\n==========================================================");
}

// -----------------------------------------------------------------------------
// MODO SENTINELA PERMANENTE (DAEMON 24/7 PARA PM2 OU SYSTEMD)
// -----------------------------------------------------------------------------
async function handleDaemon() {
    console.log("==========================================================");
    console.log("🛡️ MODO SENTINELA AUTOMÁTICO (DAEMON 24/7) ATIVADO");
    console.log("   O sistema agora vigia o calendário e executa tudo autonomamente!");
    console.log("==========================================================");

    let ultimoDiaSync = '';
    let ultimoDiaRankings = '';
    let ultimoEnrichManha = '';
    let ultimoEnrichNoite = '';

    while (true) {
        try {
            const todayStr = getPortugalDate();
            const now = new Date();
            const lisbonTime = new Intl.DateTimeFormat('pt-PT', {
                timeZone: 'Europe/Lisbon',
                hour: 'numeric',
                minute: 'numeric',
                weekday: 'short',
                hour12: false
            }).formatToParts(now);

            const getPart = (type) => lisbonTime.find(p => p.type === type)?.value;
            const hora = parseInt(getPart('hour') || '0', 10);
            const minuto = parseInt(getPart('minute') || '0', 10);
            const diaSemana = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Lisbon', weekday: 'short' }).format(now); // Mon, Tue, ...

            // 1. Sincronização Semanal: Segundas às 04:00
            if (diaSemana === 'Mon' && hora === 4 && minuto < 15 && ultimoDiaSync !== todayStr) {
                ultimoDiaSync = todayStr;
                await handleSyncGeral();
            }

            // 2. Rankings Semanais: Terças às 20:00
            if (diaSemana === 'Tue' && hora === 20 && minuto < 15 && ultimoDiaRankings !== todayStr) {
                ultimoDiaRankings = todayStr;
                console.log(`\n🏆 A iniciar Scraper de Rankings...`);
                await executarScript('scraperRankings.js', ['--concurrency=3']);
            }

            // 3. Enrich Matinal (08:00): Apenas se houver torneios
            if (hora === 8 && minuto < 15 && ultimoEnrichManha !== todayStr) {
                ultimoEnrichManha = todayStr;
                await handleEnrich();
            }

            // 4. Enrich Noturno (23:35): Apenas se houver torneios
            if (hora === 23 && minuto >= 35 && minuto < 50 && ultimoEnrichNoite !== todayStr) {
                ultimoEnrichNoite = todayStr;
                await handleEnrich();
            }

            // 5. Live Watcher: Das 09h às 23h (a cada 10 minutos)
            if (hora >= 9 && hora <= 23 && (minuto % 10 === 3)) {
                await handleLive();
            }

        } catch (loopErr) {
            console.error("⚠️ [Daemon] Erro na ronda sentinela:", loopErr.message);
        }

        // Aguarda 60 segundos antes de reavaliar o relógio
        await new Promise(r => setTimeout(r, 60000));
    }
}

// -----------------------------------------------------------------------------
// PONTO DE ENTRADA
// -----------------------------------------------------------------------------
(async () => {
    const args = process.argv.slice(2);

    if (args.includes('--live')) {
        await handleLive();
    } else if (args.includes('--enrich')) {
        await handleEnrich();
    } else if (args.includes('--sync')) {
        await handleSyncGeral();
    } else if (args.includes('--status') || args.includes('--check')) {
        await handleStatus();
    } else if (args.includes('--daemon')) {
        await handleDaemon();
    } else {
        console.log(`
Uso do AutoDispatcher:
  node autoDispatcher.js --status     # Mostra o diagnóstico das datas e torneios de hoje
  node autoDispatcher.js --live       # Corre o liveWatcher APENAS se houver jogos hoje
  node autoDispatcher.js --enrich     # Corre o enrichTorneios APENAS se houver torneios relevantes
  node autoDispatcher.js --sync       # Executa o pipeline semanal (PDF + Tiepadel + Coordenadas + Limpeza)
  node autoDispatcher.js --daemon     # Executa continuamente 24/7 (ideal para PM2)
`);
    }
})();
