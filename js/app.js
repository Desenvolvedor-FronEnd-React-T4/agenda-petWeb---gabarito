/* ==========================================================================
   app.js — o "maestro": guarda o estado, liga os eventos e chama os outros
   módulos. Regra de negócio fica em js/dominio/, fetch em api.js,
   localStorage em storage.js e desenho da tela em ui.js.
   Carregado no HTML com <script type="module">.
   ========================================================================== */

import { CONFIG, STATUS, Servico, criarAgendamento, criarGeradorProtocolo, ultimoNumeroProtocolo } from './dominio/agendamento.js';
import { acharFeriado, cepValido, estaAtrasado, formatarDataBR, horaAgora, hojeISO, minutosAte, somenteDigitos, temConflito, validarAgendamento } from './dominio/regras.js';
import { agendamentosDoDia, calcularFechamento, filtrarAgendamentos, porBusca, porStatus, proximoAtendimento } from './dominio/fechamento.js';
import { ErroApi, buscarCep, buscarFeriados, carregarAgendaExemplo, carregarServicos } from './api.js';
import * as storage from './storage.js';
import * as ui from './ui.js';

const INTERVALO_MS = 30_000;          // o relógio e os lembretes atualizam a cada 30 s
const TEMPO_CONFIRMAR_LIMPEZA_MS = 4000;

/* Todo o estado da tela mora neste objeto (uma única "fonte da verdade"). */
const estado = {
  servicos: [],                       // Servico[]
  agenda: [],                         // Agendamento[] (e AgendamentoDomiciliar)
  dataAgenda: hojeISO(),              // dia exibido na agenda
  filtroStatus: 'todos',
  busca: '',
  expandidos: new Set(),              // protocolos com os detalhes abertos
  feriado: null,                      // { date, name } se a data escolhida for feriado
  gerarProtocolo: criarGeradorProtocolo(0),
  timerLembretes: null,               // id do setInterval
  lembretesAtivos: true,
  timerLimpar: null,                  // id do setTimeout da confirmação de "limpar dados"
  ultimoCep: '',
  atrasados: '',                      // "assinatura" dos atrasados já desenhados (evita redesenhar à toa)
};

const $ = (id) => document.getElementById(id);

/* =========================== Catálogo (fetch + 3 estados) =========================== */

async function carregarCatalogo() {
  const aviso = $('servicos-status');
  ui.mostrarEstado(aviso, 'carregando', 'Carregando serviços…');
  // Para a demonstração: abra a página com ?simularErro=servicos para provar o tratamento de falha.
  const simularErro = new URLSearchParams(location.search).get('simularErro') === 'servicos';
  try {
    const dados = await carregarServicos(simularErro ? 'data/nao-existe.json' : undefined);
    estado.servicos = dados.map((d) => new Servico(d));
  } catch (erro) {
    const mensagem = erro instanceof ErroApi && erro.tipo === 'rede' ? 'Sem conexão para carregar os serviços.' : erro.message;
    ui.mostrarEstado(aviso, 'erro', mensagem, carregarCatalogo);
    return;
  }
  ui.esconderEstado(aviso);
  ui.renderizarServicos(estado.servicos);
  ui.popularSelectServicos(estado.servicos);
  restaurarAgenda();
  atualizarTela();
}

/* =========================== Agenda: persistência =========================== */

/* Converte os objetos simples do localStorage em instâncias das classes. Item inválido é ignorado. */
function restaurarAgenda() {
  estado.agenda = storage.lerAgenda().flatMap((item) => {
    try {
      return [criarAgendamento(item, estado.servicos)];
    } catch {
      return [];
    }
  });
  estado.gerarProtocolo = criarGeradorProtocolo(ultimoNumeroProtocolo(estado.agenda));
}

const salvarAgenda = () => storage.salvarAgenda(estado.agenda);

/* =========================== Desenho da tela =========================== */

/* Lista (em texto) dos protocolos atrasados do dia exibido. */
const assinaturaAtrasados = (doDia, agora) => doDia.filter((a) => estaAtrasado(a, agora)).map((a) => a.protocolo).join(',');

function renderAgenda() {
  const agora = new Date();
  const doDia = agendamentosDoDia(estado.agenda, estado.dataAgenda);
  estado.atrasados = assinaturaAtrasados(doDia, agora);
  // CALLBACKS: passamos critérios (funções) para filtrarAgendamentos.
  const visiveis = filtrarAgendamentos(doDia, porStatus(estado.filtroStatus), porBusca(estado.busca));
  ui.renderizarAgenda(visiveis, { total: doDia.length, expandidos: estado.expandidos, agora });
}

function atualizarTela() {
  renderAgenda();
  ui.renderizarFechamento(calcularFechamento(estado.agenda, estado.dataAgenda));
  atualizarRelogio();
}

/* =========================== Relógio e lembretes (setInterval) =========================== */

function atualizarRelogio() {
  const agora = new Date();
  ui.mostrarRelogio(horaAgora(agora));

  const hoje = hojeISO(agora);
  const proximo = proximoAtendimento(agendamentosDoDia(estado.agenda, hoje), horaAgora(agora));

  if (!proximo) {
    ui.mostrarProximo('Próximo atendimento de hoje: nenhum pendente');
    ui.esconderLembrete();
  } else {
    const minutos = minutosAte(proximo.data, proximo.hora, agora);
    ui.mostrarProximo(`Próximo atendimento de hoje: ${proximo.hora} — ${proximo.pet} (${proximo.servico.nome}), em ${minutos} min`);
    if (estado.lembretesAtivos && minutos <= CONFIG.lembreteMin) {
      ui.mostrarLembrete(`Lembrete: ${proximo.pet} (${proximo.servico.nome}) às ${proximo.hora}, em ${minutos} min.`);
    } else {
      ui.esconderLembrete();
    }
  }
  // Só redesenha a lista se mudou quem está atrasado (redesenhar à toa tira o foco de quem navega por teclado).
  const doDiaExibido = agendamentosDoDia(estado.agenda, estado.dataAgenda);
  if (assinaturaAtrasados(doDiaExibido, agora) !== estado.atrasados) renderAgenda();
}

function iniciarLembretes() {
  clearInterval(estado.timerLembretes);              // nunca deixa dois timers rodando
  estado.timerLembretes = setInterval(atualizarRelogio, INTERVALO_MS);
  estado.lembretesAtivos = true;
  ui.atualizarBotaoLembretes(true);
  atualizarRelogio();
}

function pausarLembretes() {
  clearInterval(estado.timerLembretes);
  estado.timerLembretes = null;
  estado.lembretesAtivos = false;
  ui.atualizarBotaoLembretes(false);
  ui.esconderLembrete();
}

function alternarLembretes() {
  if (estado.lembretesAtivos) {
    pausarLembretes();
    ui.mostrarToast('Lembretes pausados.', 'info');
  } else {
    iniciarLembretes();
    ui.mostrarToast('Lembretes retomados.', 'info');
  }
}

/* =========================== Formulário =========================== */

function aoEnviar(evento) {
  evento.preventDefault();                           // não recarrega a página
  ui.limparErros();

  const dados = ui.lerFormulario();
  const servico = estado.servicos.find((s) => s.id === dados.servicoId);
  const erros = validarAgendamento(dados, servico);

  if (estado.feriado && !dados.confirmarFeriado) {
    erros['feriado-confirmar'] = 'Marque "Agendar mesmo assim" para agendar em um feriado.';
  }

  let novo = null;
  if (Object.keys(erros).length === 0) {
    novo = criarAgendamento({ ...dados, protocolo: '(novo)' }, estado.servicos);
    if (temConflito(estado.agenda, novo)) {
      erros.hora = `Já existe um atendimento às ${dados.hora} em ${formatarDataBR(dados.data)}. Escolha outro horário.`;
    }
  }

  if (Object.keys(erros).length > 0) {
    ui.mostrarErros(erros);
    return;
  }

  novo.protocolo = estado.gerarProtocolo();
  estado.agenda.push(novo);
  salvarAgenda();

  estado.dataAgenda = novo.data;                     // mostra o dia onde o novo item entrou
  ui.definirControlesAgenda({ data: estado.dataAgenda, filtro: estado.filtroStatus, busca: estado.busca });
  ui.limparFormulario();
  estado.feriado = null;
  atualizarTela();
  ui.mostrarToast(`Agendamento ${novo.protocolo} salvo: ${novo.pet}, ${formatarDataBR(novo.data)} às ${novo.hora}.`);
}

function aoMudarServico() {
  const servico = estado.servicos.find((s) => s.id === $('servico').value);
  ui.configurarDomiciliar(servico);
}

function aoMudarDomiciliar() {
  ui.alternarEndereco($('domiciliar').checked);
}

/* =========================== CEP (ViaCEP) =========================== */

async function consultarCep() {
  const cep = $('cep').value;
  if (!cepValido(cep)) return;
  const digitos = somenteDigitos(cep);
  if (digitos === estado.ultimoCep) return;           // evita repetir a mesma consulta
  estado.ultimoCep = digitos;

  ui.mostrarCepStatus('carregando', 'Buscando endereço…');
  try {
    const endereco = await buscarCep(cep);
    if (somenteDigitos($('cep').value) !== digitos) return;   // a pessoa já mudou o CEP: descarta
    ui.preencherEndereco(endereco);
    ui.mostrarCepStatus('sucesso', 'Endereço preenchido. Confira e informe o número.');
  } catch (erro) {
    estado.ultimoCep = '';                            // permite tentar de novo
    const mensagens = {
      formato: 'O CEP deve ter 8 dígitos.',
      'nao-encontrado': 'CEP não encontrado. Preencha o endereço manualmente.',
      rede: 'Sem conexão com o serviço de CEP. Preencha o endereço manualmente.',
      http: 'O serviço de CEP está indisponível agora. Preencha o endereço manualmente.',
    };
    ui.mostrarCepStatus('erro', mensagens[erro.tipo] ?? 'Não foi possível consultar o CEP. Preencha manualmente.');
  }
}

function aoDigitarCep() {
  const digitos = somenteDigitos($('cep').value);
  if (digitos.length === 8) {
    consultarCep();
  } else if (digitos.length < 8) {
    estado.ultimoCep = '';
    ui.esconderCepStatus();
  }
}

function aoSairDoCep() {
  const digitos = somenteDigitos($('cep').value);
  if (digitos.length > 0 && digitos.length !== 8) ui.mostrarCepStatus('erro', 'O CEP deve ter 8 dígitos.');
}

/* =========================== Feriados (BrasilAPI + cache) =========================== */

async function verificarFeriado() {
  const data = $('data').value;
  estado.feriado = null;
  ui.esconderFeriado();
  if (!data) return;

  try {
    const feriados = await buscarFeriados(Number(data.slice(0, 4)));
    if ($('data').value !== data) return;             // a data mudou durante a consulta
    const feriado = acharFeriado(feriados, data);
    if (feriado) {
      estado.feriado = feriado;
      ui.mostrarFeriado(feriado.name, data);
    }
  } catch {
    if ($('data').value === data) ui.mostrarFeriadoIndisponivel();   // não bloqueia o agendamento
  }
}

/* =========================== Agenda: cliques, mouse, busca e filtros =========================== */

function protocoloDoItem(elemento) {
  const item = elemento.closest('.item');
  return item ? item.dataset.protocolo : null;
}

function aoClicarNaAgenda(evento) {
  const botao = evento.target.closest('[data-acao]');
  if (!botao) return;
  const protocolo = protocoloDoItem(botao);
  const agendamento = estado.agenda.find((a) => a.protocolo === protocolo);
  if (!agendamento) return;

  switch (botao.dataset.acao) {
    case 'alternar':
      if (estado.expandidos.has(protocolo)) estado.expandidos.delete(protocolo);
      else estado.expandidos.add(protocolo);
      renderAgenda();
      focarToggle(protocolo);
      break;
    case 'concluir':
      agendamento.alterarStatus(STATUS.CONCLUIDO);
      aoMudarStatus(protocolo, `${agendamento.protocolo} (${agendamento.pet}) concluído.`);
      break;
    case 'cancelar':
      agendamento.alterarStatus(STATUS.CANCELADO);
      aoMudarStatus(protocolo, `${agendamento.protocolo} (${agendamento.pet}) cancelado. O horário foi liberado.`, 'info');
      break;
    default:
  }
}

function aoMudarStatus(protocolo, mensagem, tipo = 'sucesso') {
  salvarAgenda();
  atualizarTela();
  focarToggle(protocolo);
  ui.mostrarToast(mensagem, tipo);
}

/* Depois de redesenhar a lista, devolve o foco ao item (senão quem usa teclado "se perde"). */
function focarToggle(protocolo) {
  $('lista-agenda').querySelector(`[data-protocolo="${protocolo}"] .item__toggle`)?.focus();
}

/* Mouse: destaca o item sob o cursor (mouseover/mouseout "borbulham", então delegamos na lista). */
function aoPassarMouse(evento) {
  const item = evento.target.closest('.item');
  if (item) item.classList.add('item--realce');
}

function aoTirarMouse(evento) {
  const item = evento.target.closest('.item');
  if (item) item.classList.remove('item--realce');
}

function aoBuscar() {
  estado.busca = $('busca').value;
  renderAgenda();
}

function aoMudarFiltro() {
  estado.filtroStatus = $('filtro-status').value;
  storage.salvarFiltro(estado.filtroStatus);
  renderAgenda();
}

function aoMudarDiaDaAgenda() {
  if (!$('data-agenda').value) return;
  estado.dataAgenda = $('data-agenda').value;
  atualizarTela();
}

/* =========================== Teclado =========================== */

function aoPressionarTecla(evento) {
  const alvo = evento.target;

  if (evento.key === 'Escape' && alvo.id === 'busca') {
    $('busca').value = '';
    aoBuscar();
    return;
  }

  const digitando = alvo.matches('input, textarea, select');
  if (digitando || evento.ctrlKey || evento.metaKey || evento.altKey) return;   // atalhos só fora dos campos

  if (evento.key === '/') {
    evento.preventDefault();
    $('busca').focus();
  } else if (evento.key.toLowerCase() === 'n') {
    evento.preventDefault();
    $('novo-agendamento').scrollIntoView({ block: 'start' });
    $('tutor').focus();
  }
}

/* =========================== Dados: exemplo, exportar, limpar, tema =========================== */

async function carregarExemplo() {
  try {
    const exemplo = await carregarAgendaExemplo();
    // Se o protocolo do exemplo já existe na sua agenda, o item ganha um protocolo novo (nada é descartado).
    // O novo número parte do MAIOR entre a agenda e o exemplo, para nunca repetir um protocolo.
    const existentes = new Set(estado.agenda.map((a) => a.protocolo));
    const gerarNovo = criarGeradorProtocolo(Math.max(ultimoNumeroProtocolo(estado.agenda), ultimoNumeroProtocolo(exemplo)));
    const novos = exemplo.map((item) => {
      const protocolo = existentes.has(item.protocolo) ? gerarNovo() : item.protocolo;
      return criarAgendamento({ ...item, protocolo }, estado.servicos);
    });
    estado.agenda.push(...novos);
    estado.gerarProtocolo = criarGeradorProtocolo(ultimoNumeroProtocolo(estado.agenda));
    salvarAgenda();
    estado.dataAgenda = exemplo[0].data;
    ui.definirControlesAgenda({ data: estado.dataAgenda, filtro: estado.filtroStatus, busca: estado.busca });
    atualizarTela();
    ui.mostrarToast(`${novos.length} agendamentos de exemplo carregados (veja o dia ${formatarDataBR(estado.dataAgenda)}).`);
  } catch (erro) {
    ui.mostrarToast(erro.message, 'erro');
  }
}

const agendaEmJSON = () => JSON.stringify(estado.agenda.map((a) => a.paraJSON()), null, 2);

function exportarAgenda() {
  ui.exibirExportacao(agendaEmJSON());
}

async function copiarAgenda() {
  try {
    await ui.copiarExportacao();
    ui.mostrarToast('JSON copiado para a área de transferência.');
  } catch {
    ui.mostrarToast('Não foi possível copiar automaticamente. O texto está selecionado: use Ctrl+C.', 'info');
  }
}

/* Download com Blob: cria um "arquivo" em memória e clica num link temporário. */
function baixarAgenda() {
  const blob = new Blob([agendaEmJSON()], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'agenda.json';
  link.click();
  URL.revokeObjectURL(url);
}

/* "Limpar meus dados" em duas etapas (sem janela de confirmação): o 1º clique pede confirmação por 4 s. */
function limparDados() {
  if (estado.timerLimpar === null) {
    ui.definirBotaoLimpar(true);
    estado.timerLimpar = setTimeout(() => {
      estado.timerLimpar = null;
      ui.definirBotaoLimpar(false);
    }, TEMPO_CONFIRMAR_LIMPEZA_MS);
    return;
  }
  clearTimeout(estado.timerLimpar);
  estado.timerLimpar = null;
  ui.definirBotaoLimpar(false);

  const removidas = storage.limparDados();            // só as chaves "agendapet:*"
  estado.agenda = [];
  estado.expandidos.clear();
  estado.filtroStatus = 'todos';
  estado.busca = '';
  estado.dataAgenda = hojeISO();
  estado.gerarProtocolo = criarGeradorProtocolo(0);
  ui.aplicarTema('claro');
  ui.definirControlesAgenda({ data: estado.dataAgenda, filtro: 'todos', busca: '' });
  atualizarTela();
  ui.mostrarToast(`Dados da AgendaPet removidos (${removidas} itens).`, 'info');
}

function alternarTema() {
  const novo = document.documentElement.dataset.tema === 'escuro' ? 'claro' : 'escuro';
  ui.aplicarTema(novo);
  storage.salvarTema(novo);
}

/* =========================== Ligações e início =========================== */

function ligarEventos() {
  $('form-agendamento').addEventListener('submit', aoEnviar);
  $('servico').addEventListener('change', aoMudarServico);
  $('domiciliar').addEventListener('change', aoMudarDomiciliar);
  $('cep').addEventListener('input', aoDigitarCep);
  $('cep').addEventListener('blur', aoSairDoCep);
  $('data').addEventListener('change', verificarFeriado);

  const lista = $('lista-agenda');
  lista.addEventListener('click', aoClicarNaAgenda);
  lista.addEventListener('mouseover', aoPassarMouse);
  lista.addEventListener('mouseout', aoTirarMouse);
  $('busca').addEventListener('input', aoBuscar);
  $('filtro-status').addEventListener('change', aoMudarFiltro);
  $('data-agenda').addEventListener('change', aoMudarDiaDaAgenda);

  document.addEventListener('keydown', aoPressionarTecla);

  $('btn-lembretes').addEventListener('click', alternarLembretes);
  $('btn-tema').addEventListener('click', alternarTema);
  $('btn-exemplo').addEventListener('click', carregarExemplo);
  $('btn-exportar').addEventListener('click', exportarAgenda);
  $('btn-copiar').addEventListener('click', copiarAgenda);
  $('btn-baixar').addEventListener('click', baixarAgenda);
  $('btn-limpar').addEventListener('click', limparDados);
}

function iniciar() {
  ui.aplicarTema(storage.lerTema());
  estado.filtroStatus = storage.lerFiltro();
  ui.definirDataMinima(hojeISO());
  ui.definirControlesAgenda({ data: estado.dataAgenda, filtro: estado.filtroStatus, busca: estado.busca });
  ligarEventos();
  iniciarLembretes();
  carregarCatalogo();
}

iniciar();
