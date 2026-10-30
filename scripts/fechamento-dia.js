/* ==========================================================================
   fechamento-dia.js — relatório de fechamento no TERMINAL (Node.js, ESM).
   Uso:  npm run fechamento
         node scripts/fechamento-dia.js --data=2026-10-20 --arquivo=data/agenda-exemplo.json

   Este arquivo é ESM ("type": "module" no package.json): usa import/export e
   importa os MESMOS módulos que a página usa (js/dominio/). Nada de DOM aqui.
   ========================================================================== */

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Servico, criarAgendamento } from '../js/dominio/agendamento.js';
import { calcularFechamento, montarLinhasRelatorio } from '../js/dominio/fechamento.js';
import { dataValida, hojeISO } from '../js/dominio/regras.js';

// No ESM não existem __dirname/__filename: calculamos a partir de import.meta.url.
const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const lerJSON = async (caminhoRelativo) => JSON.parse(await readFile(path.join(raiz, caminhoRelativo), 'utf8'));

/* Lê argumentos no formato --nome=valor. */
function lerArgumento(nome, padrao) {
  const argumento = process.argv.find((a) => a.startsWith(`--${nome}=`));
  return argumento ? argumento.slice(nome.length + 3) : padrao;
}

async function main() {
  const data = lerArgumento('data', hojeISO());
  const arquivo = lerArgumento('arquivo', 'data/agenda-exemplo.json');

  if (!dataValida(data)) {
    console.error(`Data inválida: "${data}". Use o formato AAAA-MM-DD (ex.: --data=2026-10-20).`);
    process.exitCode = 1;
    return;
  }

  const catalogo = (await lerJSON('data/servicos.json')).map((dados) => new Servico(dados));
  const agenda = (await lerJSON(arquivo)).map((item) => criarAgendamento(item, catalogo));

  const fechamento = calcularFechamento(agenda, data);

  if (fechamento.total === 0) {
    const datas = [...new Set(agenda.map((a) => a.data))].sort();
    console.log(`Nenhum agendamento em ${data}. Datas com agendamentos em ${arquivo}: ${datas.join(', ')}`);
    return;
  }

  console.log(montarLinhasRelatorio(fechamento).join('\n'));
}

main().catch((erro) => {
  console.error(`Não foi possível gerar o fechamento: ${erro.message}`);
  process.exitCode = 1;
});
