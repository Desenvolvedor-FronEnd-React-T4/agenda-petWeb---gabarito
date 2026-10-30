/* ==========================================================================
   regras.js — validações e funções de apoio (puras, sem DOM).
   Usado pela página (formulário) e pelo Node (validar-agenda.cjs).
   ========================================================================== */

import { CONFIG, STATUS, normalizarTexto } from './agendamento.js';

/* ---------- Datas e horas (sempre em texto ISO local: "AAAA-MM-DD" e "HH:MM") ---------- */

const doisDigitos = (n) => String(n).padStart(2, '0');

export const hojeISO = (agora = new Date()) =>
  `${agora.getFullYear()}-${doisDigitos(agora.getMonth() + 1)}-${doisDigitos(agora.getDate())}`;

export const horaAgora = (agora = new Date()) => `${doisDigitos(agora.getHours())}:${doisDigitos(agora.getMinutes())}`;

export function dataValida(texto) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(texto ?? '')) return false;
  const [ano, mes, dia] = texto.split('-').map(Number);
  const d = new Date(ano, mes - 1, dia);
  return d.getFullYear() === ano && d.getMonth() === mes - 1 && d.getDate() === dia;
}

export const horaValida = (texto) => /^([01]\d|2[0-3]):[0-5]\d$/.test(texto ?? '');

export const paraMinutos = (hora) => {
  const [h, m] = hora.split(':').map(Number);
  return h * 60 + m;
};

export const formatarDataBR = (iso) => iso.split('-').reverse().join('/');

/* Minutos entre "agora" e o atendimento (negativo = já passou). */
export function minutosAte(data, hora, agora = new Date()) {
  const alvo = new Date(`${data}T${hora}:00`);
  return Math.round((alvo - agora) / 60000);
}

/* Atrasado = ainda "Agendado", mas o horário já passou. */
export const estaAtrasado = (agendamento, agora = new Date()) =>
  agendamento.status === STATUS.AGENDADO && minutosAte(agendamento.data, agendamento.hora, agora) < 0;

/* ---------- Funcionamento da loja ---------- */

/* O atendimento começa em um horário "redondo" (de 30 em 30 min), a partir da
   abertura, e TERMINA até o fechamento. Ex.: banho e tosa (120 min) às 17:00 não cabe. */
export function horarioDentroDoFuncionamento(hora, duracaoMin) {
  const inicio = paraMinutos(hora);
  const fim = inicio + duracaoMin;
  const redondo = (inicio - paraMinutos(CONFIG.abertura)) % CONFIG.passoMin === 0;
  return redondo && inicio >= paraMinutos(CONFIG.abertura) && fim <= paraMinutos(CONFIG.fechamento);
}

/* ---------- Contato e endereço ---------- */

export const somenteDigitos = (texto) => String(texto ?? '').replace(/\D/g, '');

export const telefoneValido = (texto) => [10, 11].includes(somenteDigitos(texto).length);

export const cepValido = (texto) => somenteDigitos(texto).length === 8;

export function formatarCep(texto) {
  const d = somenteDigitos(texto);
  return d.length === 8 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
}

/* ---------- Validação do formulário ----------
   Devolve um objeto { idDoCampo: "mensagem" }. Vazio = tudo certo.
   As chaves são os ids dos campos do HTML, para a tela marcar o campo certo. */
export function validarAgendamento(dados, servico, { hoje = hojeISO(), agora = horaAgora() } = {}) {
  const erros = {};

  if (!dados.tutor || dados.tutor.trim().length < 3) erros.tutor = 'Informe o nome do tutor (mínimo 3 letras).';
  if (!telefoneValido(dados.telefone)) erros.telefone = 'Informe um telefone com DDD (10 ou 11 dígitos).';
  if (!dados.pet || dados.pet.trim().length < 2) erros.pet = 'Informe o nome do pet.';
  if (!dados.especie) erros.especie = 'Escolha a espécie do pet.';
  if (!servico) erros.servico = 'Escolha um serviço.';

  if (!dados.data) {
    erros.data = 'Escolha a data do atendimento.';
  } else if (!dataValida(dados.data)) {
    erros.data = 'Data inválida.';
  } else if (dados.data < hoje) {
    erros.data = 'Não é possível agendar em uma data que já passou.';
  }

  if (!dados.hora) {
    erros.hora = 'Escolha o horário.';
  } else if (!horaValida(dados.hora)) {
    erros.hora = 'Horário inválido.';
  } else if (servico && !horarioDentroDoFuncionamento(dados.hora, servico.duracaoMin)) {
    erros.hora = `Fora do funcionamento: atendemos das ${CONFIG.abertura} às ${CONFIG.fechamento}, em horários de ${CONFIG.passoMin} em ${CONFIG.passoMin} minutos, e o serviço precisa terminar até o fechamento.`;
  } else if (!erros.data && dados.data === hoje && dados.hora <= agora) {
    erros.hora = 'Esse horário de hoje já passou.';
  }

  if (dados.domiciliar) {
    if (servico && !servico.domiciliar) erros.servico = 'Este serviço não é realizado a domicílio.';
    const e = dados.endereco ?? {};
    if (!cepValido(e.cep)) erros.cep = 'Informe um CEP com 8 dígitos.';
    if (!e.logradouro?.trim()) erros.logradouro = 'Informe a rua.';
    if (!e.numero?.trim()) erros.numero = 'Informe o número.';
    if (!e.bairro?.trim()) erros.bairro = 'Informe o bairro.';
    if (!e.cidade?.trim()) erros.cidade = 'Informe a cidade.';
    if (!/^[A-Za-z]{2}$/.test(e.uf ?? '')) erros.uf = 'Informe a UF com 2 letras.';
  }

  return erros;
}

/* ---------- Conflito de horário ---------- */
export const temConflito = (lista, candidato) => lista.some((existente) => existente.conflitaCom(candidato));

/* ---------- Feriados (a lista vem da BrasilAPI: [{ date, name }]) ---------- */
export const acharFeriado = (feriados, data) => feriados.find((f) => f.date === data) ?? null;

/* ---------- Formatação ---------- */
export const formatarMoeda = (valor) => valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export { normalizarTexto };
