require('dotenv').config();
const fetch = globalThis.fetch || require('node-fetch');

const SUPABASE_URL = process.env.SUPABASE_URL_SN_LIGA;
const SUPABASE_KEY = process.env.SUPABASE_KEY_SN_LIGA;

async function obterCoordenadas(moradaOriginal, nomeClube) {
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

(async () => {
    console.log("🌍 A procurar torneios sem coordenadas...");

    const queryUrl = `${SUPABASE_URL}/rest/v1/torneiosfpp?lat=is.null&clube_morada=not.is.null&select=id,nome,clube_nome,clube_morada`;

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
        return console.log("🎉 Todos os torneios já têm coordenadas!");
    }

    console.log(`Encontrados ${torneios.length} torneios para atualizar.\n`);

    for (const torneio of torneios) {
        console.log(`📍 A processar: ${torneio.nome}`);

        // Passamos também o nome do clube para ajudar na busca
        const coords = await obterCoordenadas(torneio.clube_morada, torneio.clube_nome);

        if (coords.lat && coords.lng) {
            const updateRes = await fetch(`${SUPABASE_URL}/rest/v1/torneiosfpp?id=eq.${torneio.id}`, {
                method: 'PATCH',
                headers: {
                    'apikey': SUPABASE_KEY,
                    'Authorization': `Bearer ${SUPABASE_KEY}`,
                    'Content-Type': 'application/json',
                    'Prefer': 'return=representation'
                },
                body: JSON.stringify({ lat: coords.lat, lng: coords.lng })
            });

            if (updateRes.ok) {
                console.log(`   ✅ Sucesso: [${coords.lat}, ${coords.lng}]`);
            } else {
                console.log(`   ❌ Erro a guardar no Supabase.`);
            }
        } else {
            console.log(`   ⚠️ Desisto. Não encontrei no mapa: ${torneio.clube_morada}`);
        }

        // Pausa obrigatória para não bloquear a API gratuita do OSM
        await new Promise(resolve => setTimeout(resolve, 1500));
    }

    console.log("\n🏁 Atualização de coordenadas concluída!");
})();