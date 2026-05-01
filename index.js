const { fork } = require('child_process');
const path = require('path');

console.log("🤖 [Sistema] Iniciando scrapers duplos...");

function lancar(ficheiro) {
    const p = fork(path.join(__dirname, ficheiro));
    p.on('exit', (code) => console.log(`📡 [${ficheiro}] Saiu com código ${code}`));
}

// LANÇA OS DOIS
lancar('scraperLiga.js');
lancar('scraperFppPontos.js'); // Certifica-te que este ficheiro tem o código do outro scraper