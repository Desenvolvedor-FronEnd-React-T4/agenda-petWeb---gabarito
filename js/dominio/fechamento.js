/* ==========================================================================
   fechamento.js — cálculos da agenda e do fechamento do dia (puros, sem DOM).
   Aqui moram os métodos de array: filter, map, find, every, some, reduce, sort.
   ========================================================================== */

import { STATUS, normalizarTexto } from './agendamento.js';
import { formatarDataBR, formatarMoeda } from './regras.js';

/* sort: ordena por data+hora ("2026-10-20T09:00" compara bem como texto). Copia antes de ordenar. */
export const ordenarPorHora = (lista) => [...lista].sort((a, b) => a.inicio.localeCompare(b.inicio));

/* filter + sort: só os do dia, em ordem de horário. */
export const agendamentosDoDia = (lista, data) => ordenarPorHora(lista.filter((a) => a.data === data));

/* ---------- CALLBACK ----------
   filtrarAgendamentos recebe FUNÇÕES (os critérios) e as aplica a cada item.
   `every` garante que o item atenda a TODOS os critérios. */
export function filtrarAgendamentos(lista, ...criterios) {
  return lista.filter((agendamento) => criterios.every((criterio) => criterio(agendamento)));
}

/* Fábricas de critérios: cada uma devolve uma função pronta para ser usada como callback. */
export const porStatus = (status) => (agendamento) => status === 'todos' || agendamento.status === status;

export const porBusca = (texto) => {
  const termo = normalizarTexto(texto);
  return (agendamento) => termo === '' || normalizarTexto(`${agendamento.tutor} ${agendamento.pet}`).includes(termo);
};

/* find: o primeiro atendimento ainda "Agendado" a partir da hora informada. */
export const proximoAtendimento = (listaDoDia, horaAtual) =>
  listaDoDia.find((a) => a.status === STATUS.AGENDADO && a.hora >= horaAtual) ?? null;

/* ---------- Fechamento do dia ---------- */
export function calcularFechamento(lista, data) {
  const doDia = agendamentosDoDia(lista, data);
  const ativos = doDia.filter((a) => a.ativo);                       // filter
  const concluidos = doDia.filter((a) => a.status === STATUS.CONCLUIDO);
  const agendados = doDia.filter((a) => a.status === STATUS.AGENDADO);
  const cancelados = doDia.filter((a) => a.status === STATUS.CANCELADO);

  // reduce: soma o valor (com taxa domiciliar, se houver) só dos concluídos.
  const faturamento = concluidos.reduce((total, a) => total + a.calcularValor(), 0);
  const aReceber = agendados.reduce((total, a) => total + a.calcularValor(), 0);

  // reduce agrupando por serviço: { id: { servico, quantidade, faturado } }
  const grupos = ativos.reduce((acc, a) => {
    const grupo = acc[a.servico.id] ?? { servico: a.servico.nome, quantidade: 0, faturado: 0 };
    grupo.quantidade += 1;
    if (a.status === STATUS.CONCLUIDO) grupo.faturado += a.calcularValor();
    acc[a.servico.id] = grupo;
    return acc;
  }, {});
  const porServico = Object.values(grupos).sort((a, b) => b.quantidade - a.quantidade || a.servico.localeCompare(b.servico));

  return {
    data,
    total: doDia.length,
    ativos: ativos.length,
    concluidos: concluidos.length,
    agendados: agendados.length,
    cancelados: cancelados.length,
    faturamento,
    aReceber,
    porServico,
    // every: o dia só está "encerrado" se existe atendimento e nenhum segue pendente.
    encerrado: doDia.length > 0 && doDia.every((a) => a.status !== STATUS.AGENDADO),
    // some: há algum atendimento domiciliar no dia?
    temDomiciliar: doDia.some((a) => a.tipo === 'Domiciliar'),
  };
}

/* ---------- Texto do relatório (usado pelo script de terminal) ----------
   Aqui entra o laço `for...of`: percorre cada serviço montando uma linha. */
export function montarLinhasRelatorio(fechamento) {
  const linhas = [];
  linhas.push(`FECHAMENTO DO DIA ${formatarDataBR(fechamento.data)} — Patinhas & Cia`);
  linhas.push('='.repeat(56));
  linhas.push(`Atendimentos no dia ..... ${fechamento.total}`);
  linhas.push(`  concluídos ............ ${fechamento.concluidos}`);
  linhas.push(`  ainda agendados ....... ${fechamento.agendados}`);
  linhas.push(`  cancelados ............ ${fechamento.cancelados}`);
  linhas.push(`Faturamento (concluídos)  ${formatarMoeda(fechamento.faturamento)}`);
  linhas.push(`A receber (agendados) ... ${formatarMoeda(fechamento.aReceber)}`);
  linhas.push('-'.repeat(56));
  linhas.push('Por serviço (sem cancelados):');
  for (const item of fechamento.porServico) {
    linhas.push(`  ${item.servico.padEnd(26)} ${String(item.quantidade).padStart(2)}x   faturado ${formatarMoeda(item.faturado)}`);
  }
  if (fechamento.porServico.length === 0) linhas.push('  (nenhum atendimento ativo)');
  linhas.push('-'.repeat(56));
  linhas.push(fechamento.encerrado ? 'Situação: dia ENCERRADO (nenhum atendimento pendente).' : 'Situação: dia em andamento (há atendimentos pendentes).');
  return linhas;
}
