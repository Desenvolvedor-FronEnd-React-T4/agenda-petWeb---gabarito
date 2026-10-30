/* ==========================================================================
   validar-agenda.cjs — valida um arquivo de agenda exportado (CommonJS).
   Uso:  npm run validar
         node scripts/validar-agenda.cjs data/agenda-invalida.json

   A extensão .cjs força o CommonJS mesmo com "type": "module" no package.json.
   Aqui usamos require() e __dirname (que não existem no ESM).
   Para reaproveitar as regras do domínio (que são ESM), usamos import()
   DINÂMICO: é a ponte que o CommonJS tem para carregar módulos ES.
   Termina com código 1 se encontrar erro (útil em automações).
   ========================================================================== */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const raiz = path.resolve(__dirname, '..');
const STATUS_VALIDOS = ['Agendado', 'Concluído', 'Cancelado'];
const CAMPOS_OBRIGATORIOS = ['protocolo', 'tutor', 'telefone', 'pet', 'especie', 'servicoId', 'data', 'hora', 'status'];

function lerJSON(caminhoRelativo) {
  return JSON.parse(fs.readFileSync(path.resolve(raiz, caminhoRelativo), 'utf8'));
}

async function main() {
  const arquivo = process.argv[2] || 'data/agenda-exemplo.json';

  let agenda;
  let servicos;
  try {
    servicos = lerJSON('data/servicos.json');
    agenda = lerJSON(arquivo);
  } catch (erro) {
    console.error(`[ERRO] Não foi possível ler os arquivos: ${erro.message}`);
    process.exit(1);
  }
  if (!Array.isArray(agenda)) {
    console.error(`[ERRO] ${arquivo}: o conteúdo deveria ser uma lista (array) de agendamentos.`);
    process.exit(1);
  }

  // import() dinâmico: carrega os módulos ESM do domínio a partir deste arquivo CommonJS.
  const { Servico, criarAgendamento } = await import('../js/dominio/agendamento.js');
  const regras = await import('../js/dominio/regras.js');

  const catalogo = servicos.map((s) => new Servico(s));
  const erros = [];
  const protocolosVistos = new Set();
  const validos = [];

  agenda.forEach((item, indice) => {
    const rotulo = `[${item.protocolo || `item ${indice + 1}`}]`;
    const falha = (mensagem) => erros.push(`${rotulo} ${mensagem}`);

    for (const campo of CAMPOS_OBRIGATORIOS) {
      if (item[campo] === undefined || item[campo] === null || String(item[campo]).trim() === '') {
        falha(`campo obrigatório ausente: "${campo}".`);
      }
    }
    if (item.protocolo) {
      if (protocolosVistos.has(item.protocolo)) falha('protocolo repetido.');
      protocolosVistos.add(item.protocolo);
    }
    if (item.status && !STATUS_VALIDOS.includes(item.status)) falha(`status inválido: "${item.status}".`);
    if (item.data && !regras.dataValida(item.data)) falha(`data inválida: "${item.data}" (use AAAA-MM-DD).`);
    if (item.hora && !regras.horaValida(item.hora)) falha(`hora inválida: "${item.hora}" (use HH:MM).`);
    if (item.telefone && !regras.telefoneValido(item.telefone)) falha(`telefone inválido: "${item.telefone}".`);

    const servico = catalogo.find((s) => s.id === item.servicoId);
    if (item.servicoId && !servico) falha(`serviço inexistente: "${item.servicoId}".`);
    if (servico && regras.horaValida(item.hora) && !regras.horarioDentroDoFuncionamento(item.hora, servico.duracaoMin)) {
      falha(`horário ${item.hora} fora do funcionamento para "${servico.nome}".`);
    }
    if (item.domiciliar) {
      if (servico && !servico.domiciliar) falha(`o serviço "${servico.nome}" não é realizado a domicílio.`);
      const e = item.endereco;
      if (!e || !regras.cepValido(e.cep) || !e.logradouro || !e.numero || !e.bairro || !e.cidade || !e.uf) {
        falha('atendimento domiciliar sem endereço completo (cep, logradouro, numero, bairro, cidade, uf).');
      }
    }

    if (erros.every((mensagem) => !mensagem.startsWith(rotulo))) {
      validos.push(criarAgendamento(item, catalogo));
    }
  });

  // Conflito de horário: compara os itens válidos dois a dois.
  for (let i = 0; i < validos.length; i += 1) {
    for (let j = i + 1; j < validos.length; j += 1) {
      if (validos[i].conflitaCom(validos[j])) {
        erros.push(`[${validos[i].protocolo} x ${validos[j].protocolo}] conflito: ambos ativos em ${validos[i].data} às ${validos[i].hora}.`);
      }
    }
  }

  if (erros.length > 0) {
    console.error(`[ERRO] ${arquivo}: ${erros.length} problema(s) encontrado(s):`);
    erros.forEach((mensagem) => console.error(`  - ${mensagem}`));
    process.exit(1);
  }
  console.log(`[OK] ${arquivo}: ${agenda.length} agendamento(s) válido(s), sem conflitos de horário.`);
}

main().catch((erro) => {
  console.error(`[ERRO] Falha inesperada: ${erro.message}`);
  process.exit(1);
});
