/* ==========================================================================
   ui.js — desenha na tela (DOM): createElement, textContent, classList.
   Nada aqui busca dados nem salva: só recebe informação e mostra.
   REGRA: texto vindo de pessoas entra com textContent, NUNCA com innerHTML.
   ========================================================================== */

import { STATUS } from './dominio/agendamento.js';
import { estaAtrasado, formatarDataBR, formatarMoeda } from './dominio/regras.js';

const $ = (id) => document.getElementById(id);

/* Cria um elemento: criar('li', { classe: 'item', texto: 'Oi', atributos: { 'data-x': 1 } }, ...filhos) */
function criar(tag, { classe, texto, atributos = {} } = {}, ...filhos) {
  const elemento = document.createElement(tag);
  if (classe) elemento.className = classe;
  if (texto !== undefined) elemento.textContent = texto;
  Object.entries(atributos).forEach(([nome, valor]) => elemento.setAttribute(nome, valor));
  filhos.forEach((filho) => elemento.append(filho));
  return elemento;
}

const plural = (n, singular, pluralTexto) => `${n} ${n === 1 ? singular : pluralTexto}`;

/* ---------- Estados: carregando / erro / sucesso ---------- */

/* tipo: 'carregando' | 'erro' | 'sucesso' | 'info'. Se vier `aoTentarNovamente`, mostra o botão. */
export function mostrarEstado(elemento, tipo, texto, aoTentarNovamente) {
  elemento.className = `status status--${tipo}`;
  elemento.replaceChildren(criar('span', { texto }));
  if (aoTentarNovamente) {
    const botao = criar('button', { classe: 'botao botao--pequeno botao--secundario', texto: 'Tentar novamente', atributos: { type: 'button' } });
    botao.addEventListener('click', aoTentarNovamente);
    elemento.append(' ', botao);
  }
  elemento.hidden = false;
}

export function esconderEstado(elemento) {
  elemento.hidden = true;
  elemento.replaceChildren();
}

/* ---------- Toast (aviso que some sozinho: setTimeout) ---------- */

let timerToast = null;   // só existe UM toast por vez; um novo cancela o timer do anterior

export function mostrarToast(texto, tipo = 'sucesso', duracaoMs = 4000) {
  const toast = $('toast');
  clearTimeout(timerToast);
  toast.className = `toast toast--${tipo}`;
  toast.textContent = texto;
  toast.hidden = false;
  timerToast = setTimeout(() => {
    toast.hidden = true;
    toast.textContent = '';
  }, duracaoMs);
}

/* ---------- Tema, lembretes e relógio ---------- */

export function aplicarTema(tema) {
  document.documentElement.dataset.tema = tema;
  const botao = $('btn-tema');
  botao.textContent = tema === 'escuro' ? 'Tema claro' : 'Tema escuro';
  botao.setAttribute('aria-pressed', String(tema === 'escuro'));
}

export function atualizarBotaoLembretes(ativos) {
  const botao = $('btn-lembretes');
  botao.textContent = ativos ? 'Pausar lembretes' : 'Retomar lembretes';
  botao.setAttribute('aria-pressed', String(ativos));
}

export function mostrarRelogio(hora) {
  $('relogio').textContent = hora;
}

export function mostrarProximo(texto) {
  $('proximo').textContent = texto;
}

export function mostrarLembrete(texto) {
  const aviso = $('lembrete');
  aviso.textContent = texto;
  aviso.hidden = false;
}

export function esconderLembrete() {
  $('lembrete').hidden = true;
}

/* ---------- Catálogo de serviços ---------- */

export function renderizarServicos(servicos) {
  const lista = $('lista-servicos');
  lista.replaceChildren();
  servicos.forEach((s) => {
    lista.append(
      criar('li', { classe: 'servico' },
        criar('div', { classe: 'servico__topo' },
          criar('strong', { classe: 'servico__nome', texto: s.nome }),
          criar('span', { classe: 'servico__preco', texto: formatarMoeda(s.preco) })),
        criar('p', { classe: 'servico__descricao', texto: s.descricao }),
        criar('p', { classe: 'servico__meta', texto: `${s.duracaoMin} min · ${s.domiciliar ? 'faz atendimento domiciliar' : 'somente na loja'}` }))
    );
  });
}

export function popularSelectServicos(servicos) {
  const select = $('servico');
  select.replaceChildren(criar('option', { texto: 'Selecione…', atributos: { value: '' } }));
  servicos.forEach((s) => {
    select.append(criar('option', { texto: `${s.nome} — ${formatarMoeda(s.preco)} (${s.duracaoMin} min)`, atributos: { value: s.id } }));
  });
}

/* ---------- Formulário ---------- */

const valorDe = (id) => $(id).value.trim();

export function lerFormulario() {
  const domiciliar = $('domiciliar').checked;
  return {
    tutor: valorDe('tutor'),
    telefone: valorDe('telefone'),
    pet: valorDe('pet'),
    especie: $('especie').value,
    servicoId: $('servico').value,
    data: $('data').value,
    hora: $('hora').value,
    observacoes: valorDe('observacoes'),
    domiciliar,
    endereco: domiciliar
      ? { cep: valorDe('cep'), logradouro: valorDe('logradouro'), numero: valorDe('numero'), complemento: valorDe('complemento'), bairro: valorDe('bairro'), cidade: valorDe('cidade'), uf: valorDe('uf').toUpperCase() }
      : null,
    confirmarFeriado: $('feriado-confirmar').checked,
  };
}

export function limparErros() {
  document.querySelectorAll('.campo__erro').forEach((p) => {
    p.hidden = true;
    p.textContent = '';
  });
  document.querySelectorAll('[aria-invalid]').forEach((campo) => campo.removeAttribute('aria-invalid'));
}

/* erros: { idDoCampo: mensagem }. Marca cada campo e leva o foco ao primeiro inválido (na ordem da tela). */
export function mostrarErros(erros) {
  Object.entries(erros).forEach(([id, mensagem]) => {
    const campo = $(id);
    const erro = $(`erro-${id}`);
    if (campo) campo.setAttribute('aria-invalid', 'true');
    if (erro) {
      erro.textContent = mensagem;
      erro.hidden = false;
    }
  });
  const primeiro = document.querySelector('#form-agendamento [aria-invalid="true"]');
  if (primeiro) primeiro.focus();
}

export function limparFormulario() {
  $('form-agendamento').reset();
  $('grupo-endereco').hidden = true;
  esconderFeriado();
  esconderEstado($('cep-status'));
}

export function definirDataMinima(hojeISO) {
  $('data').min = hojeISO;
}

/* ---------- Domiciliar, CEP e feriado ---------- */

/* Só habilita "atendimento domiciliar" se o serviço escolhido permitir. */
export function configurarDomiciliar(servico) {
  const caixa = $('domiciliar');
  const dica = $('dica-domiciliar');
  if (!servico) {
    caixa.disabled = false;
    dica.textContent = 'Escolha um serviço para ver se ele pode ser feito na casa do tutor.';
    return;
  }
  caixa.disabled = !servico.domiciliar;
  if (!servico.domiciliar) {
    caixa.checked = false;
    $('grupo-endereco').hidden = true;
    dica.textContent = `"${servico.nome}" é realizado somente na loja.`;
  } else {
    dica.textContent = 'Este serviço pode ser feito na casa do tutor (taxa de deslocamento).';
  }
}

export function alternarEndereco(mostrar) {
  $('grupo-endereco').hidden = !mostrar;
}

export function mostrarCepStatus(tipo, texto) {
  mostrarEstado($('cep-status'), tipo, texto);
}

export const esconderCepStatus = () => esconderEstado($('cep-status'));

export function preencherEndereco({ logradouro, bairro, cidade, uf, cep }) {
  $('cep').value = cep;
  $('logradouro').value = logradouro;
  $('bairro').value = bairro;
  $('cidade').value = cidade;
  $('uf').value = uf;
  ($('numero').value ? $('complemento') : $('numero')).focus();   // próximo campo que a pessoa precisa preencher
}

export function mostrarFeriado(nome, dataISO) {
  $('feriado-texto').textContent = `${formatarDataBR(dataISO)} é feriado: ${nome}. Confirme com o tutor antes de agendar.`;
  $('feriado-confirmar').closest('.campo').hidden = false;
  $('feriado-confirmar').checked = false;
  $('feriado-aviso').hidden = false;
}

export function mostrarFeriadoIndisponivel() {
  $('feriado-texto').textContent = 'Não foi possível verificar se a data é feriado agora. Você pode continuar o agendamento.';
  $('feriado-confirmar').closest('.campo').hidden = true;
  $('feriado-confirmar').checked = false;
  $('feriado-aviso').hidden = false;
}

export function esconderFeriado() {
  $('feriado-aviso').hidden = true;
  $('feriado-confirmar').checked = false;
}

/* ---------- Agenda do dia ---------- */

const CLASSE_STATUS = {
  [STATUS.AGENDADO]: 'agendado',
  [STATUS.CONCLUIDO]: 'concluido',
  [STATUS.CANCELADO]: 'cancelado',
};

function criarItem(a, expandido, agora) {
  const atrasado = estaAtrasado(a, agora);
  const idDetalhes = `detalhes-${a.protocolo}`;

  const toggle = criar('button', { classe: 'item__toggle', atributos: { type: 'button', 'data-acao': 'alternar', 'aria-expanded': String(expandido), 'aria-controls': idDetalhes } },
    criar('time', { classe: 'item__hora', texto: a.hora, atributos: { datetime: `${a.data}T${a.hora}` } }),
    criar('span', { classe: 'item__titulo', texto: `${a.pet} · ${a.servico.nome}` }),
    criar('span', { classe: 'item__tutor', texto: `${a.tutor} (${a.tipo})` }));

  const status = criar('span', { classe: `selo selo--${CLASSE_STATUS[a.status]}`, texto: a.status });
  const selos = criar('div', { classe: 'item__selos' }, status);
  if (atrasado) selos.append(criar('span', { classe: 'selo selo--atrasado', texto: 'Atrasado' }));
  selos.append(criar('span', { classe: 'item__valor', texto: formatarMoeda(a.calcularValor()) }));

  const aberto = a.status === STATUS.AGENDADO;
  const acoes = criar('div', { classe: 'item__acoes' },
    criar('button', { classe: 'botao botao--pequeno botao--principal', texto: 'Concluir', atributos: { type: 'button', 'data-acao': 'concluir', 'aria-label': `Concluir atendimento de ${a.pet}`, ...(aberto ? {} : { disabled: '' }) } }),
    criar('button', { classe: 'botao botao--pequeno botao--perigo', texto: 'Cancelar', atributos: { type: 'button', 'data-acao': 'cancelar', 'aria-label': `Cancelar atendimento de ${a.pet}`, ...(aberto ? {} : { disabled: '' }) } }));

  const detalhes = criar('dl', { classe: 'item__detalhes', atributos: { id: idDetalhes } });
  const linha = (rotulo, valor) => detalhes.append(criar('dt', { texto: rotulo }), criar('dd', { texto: valor }));
  linha('Protocolo', a.protocolo);
  linha('Telefone', a.telefone);
  linha('Espécie', a.especie);
  linha('Serviço', `${a.servico.nome} (${a.servico.duracaoMin} min)`);
  if (a.tipo === 'Domiciliar') {
    linha('Endereço', a.enderecoCompleto());
    linha('Taxa de deslocamento', formatarMoeda(a.taxaDeslocamento()));
  }
  linha('Valor total', formatarMoeda(a.calcularValor()));
  if (a.observacoes) linha('Observações', a.observacoes);
  detalhes.hidden = !expandido;

  const classes = ['item', `item--${CLASSE_STATUS[a.status]}`];
  if (atrasado) classes.push('item--atrasado');
  if (expandido) classes.push('item--expandido');

  return criar('li', { classe: classes.join(' '), atributos: { 'data-protocolo': a.protocolo } },
    criar('div', { classe: 'item__linha' }, toggle, selos), acoes, detalhes);
}

/* `lista` já vem filtrada e ordenada. `total` = quantos existem no dia (antes dos filtros). */
export function renderizarAgenda(lista, { total, expandidos, agora }) {
  const ul = $('lista-agenda');
  ul.replaceChildren(...lista.map((a) => criarItem(a, expandidos.has(a.protocolo), agora)));

  $('contador').textContent = plural(lista.length, 'agendamento', 'agendamentos');
  const vazio = $('agenda-vazio');
  if (lista.length === 0) {
    vazio.textContent = total === 0 ? 'Nenhum agendamento para este dia. Use o formulário para criar o primeiro.' : 'Nenhum agendamento corresponde à busca ou ao filtro.';
    vazio.hidden = false;
  } else {
    vazio.hidden = true;
  }
}

export function definirControlesAgenda({ data, filtro, busca }) {
  $('data-agenda').value = data;
  $('filtro-status').value = filtro;
  $('busca').value = busca;
}

/* ---------- Fechamento do dia ---------- */

export function renderizarFechamento(f) {
  $('fechamento-data').textContent = `${formatarDataBR(f.data)} · ${f.encerrado ? 'dia encerrado (nenhum pendente)' : 'dia em andamento'}`;

  const itens = [
    ['Atendimentos', String(f.total)],
    ['Concluídos', String(f.concluidos)],
    ['Agendados', String(f.agendados)],
    ['Cancelados', String(f.cancelados)],
    ['Faturamento', formatarMoeda(f.faturamento)],
    ['A receber', formatarMoeda(f.aReceber)],
  ];
  $('fechamento-resumo').replaceChildren(
    ...itens.map(([rotulo, valor]) => criar('div', { classe: 'resumo__item' }, criar('dt', { classe: 'resumo__rotulo', texto: rotulo }), criar('dd', { classe: 'resumo__valor', texto: valor })))
  );

  const corpo = $('fechamento-servicos');
  if (f.porServico.length === 0) {
    corpo.replaceChildren(criar('tr', {}, criar('td', { texto: 'Nenhum atendimento ativo neste dia.', atributos: { colspan: '3' } })));
    return;
  }
  corpo.replaceChildren(
    ...f.porServico.map((s) => criar('tr', {}, criar('td', { texto: s.servico }), criar('td', { texto: String(s.quantidade) }), criar('td', { texto: formatarMoeda(s.faturado) })))
  );
}

/* ---------- Dados: exportar e limpar ---------- */

export function exibirExportacao(json) {
  $('exportacao-texto').value = json;
  $('exportacao').hidden = false;
  $('exportacao-texto').focus();
  $('exportacao-texto').select();
}

export function copiarExportacao() {
  const area = $('exportacao-texto');
  area.focus();
  area.select();
  return navigator.clipboard ? navigator.clipboard.writeText(area.value) : Promise.reject(new Error('Área de transferência indisponível'));
}

export function definirBotaoLimpar(confirmando) {
  const botao = $('btn-limpar');
  botao.textContent = confirmando ? 'Clique de novo para confirmar' : 'Limpar meus dados';
}
