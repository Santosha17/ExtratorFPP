require('dotenv').config();
if (!process.env.SUPABASE_URL_SN_LIGA) {
    require('dotenv').config({ path: '../.env' });
}
const fetch = globalThis.fetch || require('node-fetch');
const cheerio = require('cheerio');

const SUPABASE_URL = process.env.SUPABASE_URL_SN_LIGA;
const SUPABASE_KEY = process.env.SUPABASE_KEY_SN_LIGA;

function decryptCloudflareEmail(encodedString) {
    if (!encodedString) return null;
    try {
        let email = "";
        let r = parseInt(encodedString.substr(0, 2), 16);
        for (let n = 2; n < encodedString.length; n += 2) {
            let i = parseInt(encodedString.substr(n, 2), 16) ^ r;
            email += String.fromCharCode(i);
        }
        return email;
    } catch (e) {
        return null;
    }
}

function safeUrl(href, base) {
    if (!href || href.startsWith('javascript:') || href.trim() === '#') return null;
    try {
        return new URL(href, base).href;
    } catch (e) {
        return null;
    }
}

async function obterCoordenadas(moradaOriginal, nomeClube) {
    if (!moradaOriginal) return { lat: null, lng: null };
    const headers = { 'User-Agent': 'TorneiosPadelBot/1.2' };

    // Função auxiliar para não repetir o fetch
    const tentarMapa = async (query) => {
        try {
            let url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1`;
            let res = await fetch(url, { headers });
            let data = await res.json();
            if (data && data.length > 0) {
                return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
            }
        } catch (e) { }
        return null;
    };

    // 1. Limpeza agressiva da morada (tira o 1º-D, nº, S/N)
    let moradaLimpa = moradaOriginal.split('Portugal')[0] + 'Portugal';
    moradaLimpa = moradaLimpa
        .replace(/n[ºo]\s*\d+/gi, '') // Tira nº1
        .replace(/\d+º-[a-z]/gi, '')   // Tira 1º-D
        .replace(/S\/N/gi, '')         // Tira S/N
        .replace(/Complexo[a-zA-Z\sçãéíáóúàèìòù]+/gi, '') // Tira nomes de complexos que confundem o mapa
        .trim();

    // TENTATIVA 1: Morada Limpa
    let coords = await tentarMapa(moradaLimpa);
    if (coords) return coords;

    // TENTATIVA 2: A força do Código Postal (Salva 90% dos casos)
    const cpMatch = moradaOriginal.match(/\d{4}\s*-\s*\d{3}/);
    if (cpMatch) {
        const cp = cpMatch[0].replace(/\s/g, ''); // Garante formato XXXX-XXX
        console.log(`      ↪ A forçar busca pelo Código Postal: ${cp}...`);
        coords = await tentarMapa(`${cp}, Portugal`);
        if (coords) return coords;
    }

    // TENTATIVA 3: Nome do Clube
    if (nomeClube) {
        console.log(`      ↪ A forçar busca pelo Nome do Clube...`);
        coords = await tentarMapa(`${nomeClube}, Portugal`);
        if (coords) return coords;
    }

    return { lat: null, lng: null };
}

async function extrairInfoDeTiepadel(url) {
    if (!url) return null;
    // Limpar sufixos e construir URL da página de Info
    let infoUrl = url.split('/Draws')[0].split('/Info')[0];
    if (infoUrl.endsWith('/')) {
        infoUrl = infoUrl.slice(0, -1);
    }
    infoUrl += '/Info';

    try {
        const res = await fetch(infoUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });
        if (!res.ok) return null;
        const html = await res.text();
        const $ = cheerio.load(html);

        // 1. Juiz Árbitro
        const juiz_arbitro = $('span[id$="lbl_info_details_header_referee"]').first().text().trim() || null;

        // 2. Regulamento URL (Ficha Informativa)
        const factsheetHref = $('a[id$="link_info_details_header_factsheet"]').first().attr('href') || null;
        const regulamento_url = safeUrl(factsheetHref, infoUrl);

        // 3. Organizador Nome
        const organizador_nome = $('a[id$="link_info_details_header_promoted_name"]').first().text().trim() || null;

        // 4. Organizador Info
        const org_morada = $('span[id$="lbl_info_details_header_promoted_address"]').first().text().trim() || null;
        const org_telefone = $('span[id$="lbl_info_details_header_promoted_phone"]').first().text().trim() || null;
        const org_fax = $('span[id$="lbl_info_details_header_promoted_fax"]').first().text().trim() || null;
        
        let org_email = null;
        const orgEmailCfEl = $('a[id$="link_info_details_header_promoted_email"] span.__cf_email__');
        if (orgEmailCfEl.length > 0) {
            const dataCf = orgEmailCfEl.attr('data-cfemail');
            if (dataCf) org_email = decryptCloudflareEmail(dataCf);
        }

        const org_website_href = $('a[id$="link_info_details_header_promoted_name"]').first().attr('href') || '';
        const org_website = safeUrl(org_website_href, infoUrl);

        const organizador_info = {
            nome: organizador_nome,
            morada: org_morada,
            telefone: org_telefone,
            fax: org_fax,
            email: org_email,
            website: org_website
        };

        // 5. Clubes Info
        const clube_nome = $('a[id$="link_name"]').first().text().trim() || null;
        const clube_morada = $('span[id$="lbl_address"]').first().text().trim() || null;
        const clube_telefone = $('span[id$="lbl_phone"]').first().text().trim() || null;
        const clube_fax = $('span[id$="lbl_fax"]').first().text().trim() || null;
        
        let clube_email = null;
        const clubeEmailCfEl = $('a[id$="link_email"] span.__cf_email__');
        if (clubeEmailCfEl.length > 0) {
            const dataCf = clubeEmailCfEl.attr('data-cfemail');
            if (dataCf) clube_email = decryptCloudflareEmail(dataCf);
        }

        const clube_website_href = $('a[id$="link_website"]').first().attr('href') || '';
        const clube_website = safeUrl(clube_website_href, infoUrl);

        const clubes_info = {
            nome: clube_nome,
            morada: clube_morada,
            telefone: clube_telefone,
            fax: clube_fax,
            email: clube_email,
            website: clube_website
        };

        // 6. Quadros Data (Prazos dos escalões)
        const quadros_data = [];
        $('span[id*="_Label137"]').each((idx, el) => {
            const $el = $(el);
            const id = $el.attr('id');
            const prefix = id.split('_Label137')[0];
            
            const escalao = $el.text().trim();
            const inicioInscricoes = $(`#${prefix}_lnl_inicio_inscricoes`).text().trim();
            const limiteInscricoes = $(`#${prefix}_lbl_inscricoes`).text().trim();
            const limiteCancelamento = $(`#${prefix}_lbl_cancelamento`).text().trim();
            
            quadros_data.push({
                escalao,
                inicio_inscricoes: inicioInscricoes !== '-' ? inicioInscricoes : null,
                limite_inscricoes: limiteInscricoes !== '-' ? limiteInscricoes : null,
                limite_cancelamento: limiteCancelamento !== '-' ? limiteCancelamento : null
            });
        });

        // 7. Extrair Coordenadas (lat, lng) do Clube
        const directionsHref = $('a[id$="link_directions"]').first().attr('href') || '';
        let lat = null, lng = null;

        // Método 1: Pelo link do Google Maps (directions link)
        const daddrMatch = directionsHref.match(/maps\?daddr=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/i);
        if (daddrMatch) {
            lat = parseFloat(daddrMatch[1]);
            lng = parseFloat(daddrMatch[2]);
        } else {
            // Método 2: Pelo JSON-LD (GeoCoordinates) no corpo do HTML
            const jsonLdMatch = html.match(/"latitude":\s*(-?\d+(?:\.\d+)?),\s*"longitude":\s*(-?\d+(?:\.\d+)?)/i);
            if (jsonLdMatch) {
                lat = parseFloat(jsonLdMatch[1]);
                lng = parseFloat(jsonLdMatch[2]);
            }
        }

        return {
            clube_nome,
            clube_morada,
            clube_telefone,
            lat,
            lng,
            juiz_arbitro,
            regulamento_url,
            organizador_nome,
            organizador_info,
            clubes_info,
            quadros_data
        };
    } catch (e) {
        console.error(`      ❌ Erro ao aceder a ${infoUrl}:`, e.message);
    }
    return null;
}

(async () => {
    console.log("🌍 A procurar torneios com metadados ou coordenadas em falta...");

    // Selecionamos torneios onde falte as coordenadas (lat) OU os metadados principais (ex: juiz_arbitro)
    const queryUrl = `${SUPABASE_URL}/rest/v1/torneiosfpp?or=(lat.is.null,juiz_arbitro.is.null)&url_tiepadel=not.is.null&select=id,nome,url_tiepadel,clube_nome,clube_morada,clube_telefone,organizador_nome,juiz_arbitro,regulamento_url,clubes_info,organizador_info,quadros_data,lat,lng`;

    const res = await fetch(queryUrl, {
        headers: {
            'apikey': SUPABASE_KEY,
            'Authorization': `Bearer ${SUPABASE_KEY}`,
            'Content-Type': 'application/json'
        }
    });

    if (!res.ok) {
        console.error("❌ Erro ao ligar ao Supabase:", await res.text());
        return;
    }

    const torneios = await res.json();

    if (!Array.isArray(torneios) || torneios.length === 0) {
        return console.log("🎉 Todos os torneios já estão atualizados!");
    }

    console.log(`Encontrados ${torneios.length} torneios para atualizar.\n`);

    for (const torneio of torneios) {
        console.log(`📍 A processar: ${torneio.nome}`);
        let extracted = null;

        // 1. Tentar extrair todas as informações do URL do Tiepadel (página /Info)
        if (torneio.url_tiepadel) {
            console.log(`   🔎 A aceder à página de Informações: ${torneio.url_tiepadel}`);
            extracted = await extrairInfoDeTiepadel(torneio.url_tiepadel);
        }

        let lat = extracted?.lat || torneio.lat;
        let lng = extracted?.lng || torneio.lng;
        let morada = extracted?.clube_morada || torneio.clube_morada;
        let nomeClube = extracted?.clube_nome || torneio.clube_nome;
        let telefone = extracted?.clube_telefone || torneio.clube_telefone;
        let juiz_arbitro = extracted?.juiz_arbitro || torneio.juiz_arbitro;
        let regulamento_url = extracted?.regulamento_url || torneio.regulamento_url;
        let organizador_nome = extracted?.organizador_nome || torneio.organizador_nome;
        let organizador_info = extracted?.organizador_info || torneio.organizador_info;
        let clubes_info = extracted?.clubes_info || torneio.clubes_info;
        let quadros_data = extracted?.quadros_data || torneio.quadros_data;

        // 2. Se falhar em obter coordenadas do Tiepadel, tenta via OSM Nominatim (usando a morada)
        if ((!lat || !lng) && morada) {
            console.log(`   🔎 Coordenadas não encontradas no Tiepadel. A tentar via morada (OSM Nominatim)...`);
            const coords = await obterCoordenadas(morada, nomeClube);
            lat = coords.lat;
            lng = coords.lng;
        }

        // 3. Atualizar base de dados
        const updatePayload = {};
        if (lat !== null && lat !== torneio.lat) updatePayload.lat = lat;
        if (lng !== null && lng !== torneio.lng) updatePayload.lng = lng;
        if (morada && morada !== torneio.clube_morada) updatePayload.clube_morada = morada;
        if (nomeClube && nomeClube !== torneio.clube_nome) updatePayload.clube_nome = nomeClube;
        if (telefone && telefone !== torneio.clube_telefone) updatePayload.clube_telefone = telefone;
        if (juiz_arbitro && juiz_arbitro !== torneio.juiz_arbitro) updatePayload.juiz_arbitro = juiz_arbitro;
        if (regulamento_url && regulamento_url !== torneio.regulamento_url) updatePayload.regulamento_url = regulamento_url;
        if (organizador_nome && organizador_nome !== torneio.organizador_nome) updatePayload.organizador_nome = organizador_nome;

        if (clubes_info && JSON.stringify(clubes_info) !== JSON.stringify(torneio.clubes_info)) {
            updatePayload.clubes_info = clubes_info;
            updatePayload.clubes_lista = [clubes_info];
        }
        if (organizador_info && JSON.stringify(organizador_info) !== JSON.stringify(torneio.organizador_info)) {
            updatePayload.organizador_info = organizador_info;
        }
        if (quadros_data && JSON.stringify(quadros_data) !== JSON.stringify(torneio.quadros_data)) {
            updatePayload.quadros_data = quadros_data;
        }

        if (Object.keys(updatePayload).length > 0) {
            const updateRes = await fetch(`${SUPABASE_URL}/rest/v1/torneiosfpp?id=eq.${torneio.id}`, {
                method: 'PATCH',
                headers: {
                    'apikey': SUPABASE_KEY,
                    'Authorization': `Bearer ${SUPABASE_KEY}`,
                    'Content-Type': 'application/json',
                    'Prefer': 'return=representation'
                },
                body: JSON.stringify(updatePayload)
            });

            if (updateRes.ok) {
                console.log(`   ✅ Guardado: Lat=${lat || 'N/A'}, Lng=${lng || 'N/A'}, Juiz-Árbitro="${juiz_arbitro || 'N/A'}"`);
            } else {
                console.log(`   ❌ Erro a guardar no Supabase:`, await updateRes.text());
            }
        } else {
            console.log(`   ⚠️ Não foi possível obter novas informações para este torneio.`);
        }

        // Pausa obrigatória para não sobrecarregar os servidores
        await new Promise(resolve => setTimeout(resolve, 1500));
    }

    console.log("\n🌍 Todos os torneios com metadados ou coordenadas em falta foram processados!");
})();