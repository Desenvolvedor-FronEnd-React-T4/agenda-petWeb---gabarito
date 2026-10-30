/* ==========================================================================
   agendamento.js — o "coração" do negócio: configuração, classes e protocolo.
   REGRA DE OURO: nada aqui conhece o navegador (sem document, window,
   localStorage ou fetch). Por isso o mesmo arquivo roda na página E no Node.
   ========================================================================== */

/* Decisões de negócio da Patinhas & Cia (explicadas no README). */
export const CONFIG = Object.freeze({
  abertura: '08:00',        // primeiro horário de atendimento
  fechamento: '18:00',      // o atendimento precisa TERMINAR até aqui
  passoMin: 30,             // horários de 30 em 30 minutos
  cidadeLoja: 'São Paulo',  // a taxa domiciliar depende de a casa ser nesta cidade
  ufLoja: 'SP',
  taxaMesmaCidade: 15,      // R$ de deslocamento na mesma cidade da loja
  taxaOutraCidade: 30,      // R$ de deslocamento em outra cidade
  lembreteMin: 15,          // avisar quando faltar este tempo para o atendimento
});

export const STATUS = Object.freeze({
  AGENDADO: 'Agendado',
  CONCLUIDO: 'Concluído',
  CANCELADO: 'Cancelado',
});

/* Tira acentos e deixa minúsculo: "São Paulo" e "sao paulo" ficam iguais. */
export const normalizarTexto = (texto) =>
  String(texto ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/* ---------- Servico ---------- */
export class Servico {
  constructor({ id, nome, descricao = '', preco, duracaoMin, domiciliar = false }) {
    this.id = id;
    this.nome = nome;
    this.descricao = descricao;
    this.preco = Number(preco);
    this.duracaoMin = Number(duracaoMin);
    this.domiciliar = Boolean(domiciliar);
  }
}

/* ---------- Agendamento (atendimento na loja) ---------- */
export class Agendamento {
  constructor({ protocolo, tutor, telefone, pet, especie, servico, data, hora, status = STATUS.AGENDADO, observacoes = '' }) {
    this.protocolo = protocolo;
    this.tutor = tutor;
    this.telefone = telefone;
    this.pet = pet;
    this.especie = especie;
    this.servico = servico;     // objeto Servico (não só o id)
    this.data = data;           // "AAAA-MM-DD"
    this.hora = hora;           // "HH:MM"
    this.status = status;
    this.observacoes = observacoes;
  }

  /* Cancelado libera o horário; Agendado e Concluído continuam ocupando. */
  get ativo() {
    return this.status !== STATUS.CANCELADO;
  }

  /* "2026-10-20T09:00": data + hora num texto que ordena corretamente. */
  get inicio() {
    return `${this.data}T${this.hora}`;
  }

  get tipo() {
    return 'Na loja';
  }

  calcularValor() {
    return this.servico.preco;
  }

  resumo() {
    return `${this.protocolo} · ${this.hora} · ${this.pet} (${this.tutor}) · ${this.servico.nome}`;
  }

  /* Dois agendamentos conflitam se ambos estão ativos e ocupam o mesmo dia e horário. */
  conflitaCom(outro) {
    return this !== outro && this.ativo && outro.ativo && this.data === outro.data && this.hora === outro.hora;
  }

  alterarStatus(novoStatus) {
    if (!Object.values(STATUS).includes(novoStatus)) {
      throw new Error(`Status inválido: ${novoStatus}`);
    }
    this.status = novoStatus;
    return this;
  }

  /* Objeto simples (sem métodos) para salvar no localStorage ou exportar. */
  paraJSON() {
    return {
      protocolo: this.protocolo,
      tutor: this.tutor,
      telefone: this.telefone,
      pet: this.pet,
      especie: this.especie,
      servicoId: this.servico.id,
      data: this.data,
      hora: this.hora,
      status: this.status,
      observacoes: this.observacoes,
      domiciliar: false,
      endereco: null,
    };
  }
}

/* ---------- AgendamentoDomiciliar: herda tudo e acrescenta endereço + taxa ----------
   Por que herança aqui? Um atendimento domiciliar "é um" agendamento (mesmo
   tutor, pet, serviço, data, hora e status), mas tem dado a mais (endereço) e
   o valor muda (taxa de deslocamento). Só o que é diferente é reescrito. */
export class AgendamentoDomiciliar extends Agendamento {
  constructor({ endereco, ...dados }) {
    super(dados);
    this.endereco = endereco;   // { cep, logradouro, numero, complemento, bairro, cidade, uf }
  }

  get tipo() {
    return 'Domiciliar';
  }

  taxaDeslocamento() {
    const mesmaCidade =
      normalizarTexto(this.endereco.cidade) === normalizarTexto(CONFIG.cidadeLoja) &&
      normalizarTexto(this.endereco.uf) === normalizarTexto(CONFIG.ufLoja);
    return mesmaCidade ? CONFIG.taxaMesmaCidade : CONFIG.taxaOutraCidade;
  }

  calcularValor() {
    return super.calcularValor() + this.taxaDeslocamento();
  }

  enderecoCompleto() {
    const { logradouro, numero, complemento, bairro, cidade, uf } = this.endereco;
    const compl = complemento ? ` (${complemento})` : '';
    return `${logradouro}, ${numero}${compl} - ${bairro}, ${cidade}/${uf}`;
  }

  resumo() {
    return `${super.resumo()} · Domiciliar: ${this.enderecoCompleto()}`;
  }

  paraJSON() {
    return { ...super.paraJSON(), domiciliar: true, endereco: { ...this.endereco } };
  }
}

/* ---------- Fábrica: escolhe a classe certa a partir do objeto simples ---------- */
export function criarAgendamento(dados, catalogo) {
  const servico = catalogo.find((s) => s.id === dados.servicoId);
  if (!servico) {
    throw new Error(`Serviço desconhecido: "${dados.servicoId}"`);
  }
  const base = { ...dados, servico };
  return dados.domiciliar ? new AgendamentoDomiciliar(base) : new Agendamento(base);
}

/* ---------- Closure: gerador de protocolo ----------
   `contador` fica "presa" dentro da função retornada: preservada entre as
   chamadas, sem variável global e sem ninguém de fora conseguir mexer nela. */
export function criarGeradorProtocolo(ultimo = 0) {
  let contador = ultimo;
  return function proximoProtocolo() {
    contador += 1;
    return `AP-${String(contador).padStart(4, '0')}`;
  };
}

/* Maior número de protocolo já usado ("AP-0007" → 7), para o gerador continuar dali. */
export function ultimoNumeroProtocolo(lista) {
  return lista.reduce((maior, item) => Math.max(maior, Number(String(item.protocolo).replace(/\D/g, '')) || 0), 0);
}
