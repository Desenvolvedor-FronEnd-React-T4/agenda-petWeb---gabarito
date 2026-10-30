/* ==========================================================================
   api.js — TODO o fetch mora aqui. Cada função devolve dados prontos ou
   lança um ErroApi com um "tipo", para a tela mostrar a mensagem certa.
   ========================================================================== */

import { cepValido, somenteDigitos, formatarCep } from './dominio/regras.js';
import { lerFeriadosCache, salvarFeriadosCache } from './storage.js';

const VALIDADE_CACHE_FERIADOS_MS = 30 * 24 * 60 * 60 * 1000;   // 30 dias

/* tipo: 'rede' (sem conexão) | 'http' (servidor respondeu erro) | 'formato' | 'nao-encontrado' */
export class ErroApi extends Error {
  constructor(tipo, mensagem) {
    super(mensagem);
    this.name = 'ErroApi';
    this.tipo = tipo;
  }
}

/* fetch + conferência de response.ok + conversão para JSON, num lugar só. */
async function buscarJSON(url, mensagemHttp) {
  let resposta;
  try {
    resposta = await fetch(url);
  } catch {
    // fetch só rejeita quando a requisição NEM chegou ao servidor (sem rede, DNS, etc.)
    throw new ErroApi('rede', 'Sem conexão com o servidor.');
  }
  if (!resposta.ok) {
    throw new ErroApi('http', `${mensagemHttp} (erro HTTP ${resposta.status}).`);
  }
  return resposta.json();
}

/* ---------- Servidor local: catálogo de serviços ---------- */
export const carregarServicos = (url = 'data/servicos.json') => buscarJSON(url, 'Não foi possível carregar os serviços');

/* Dados de exemplo para demonstração. */
export const carregarAgendaExemplo = () => buscarJSON('data/agenda-exemplo.json', 'Não foi possível carregar os dados de exemplo');

/* ---------- ViaCEP: endereço a partir do CEP ----------
   Atenção: CEP bem formatado mas inexistente devolve HTTP 200 com { "erro": true }. */
export async function buscarCep(cep) {
  if (!cepValido(cep)) {
    throw new ErroApi('formato', 'O CEP deve ter 8 dígitos.');
  }
  const digitos = somenteDigitos(cep);
  const dados = await buscarJSON(`https://viacep.com.br/ws/${digitos}/json/`, 'O serviço de CEP está indisponível');
  if (dados.erro) {
    throw new ErroApi('nao-encontrado', 'CEP não encontrado.');
  }
  return {
    cep: formatarCep(digitos),
    logradouro: dados.logradouro ?? '',
    bairro: dados.bairro ?? '',
    cidade: dados.localidade ?? '',
    uf: dados.uf ?? '',
  };
}

/* ---------- BrasilAPI: feriados nacionais do ano ----------
   Cache no localStorage por 30 dias: a lista de um ano quase não muda. */
export async function buscarFeriados(ano) {
  const emCache = lerFeriadosCache(ano, VALIDADE_CACHE_FERIADOS_MS);
  if (emCache) return emCache;

  const dados = await buscarJSON(`https://brasilapi.com.br/api/feriados/v1/${ano}`, 'O serviço de feriados está indisponível');
  const feriados = dados.map(({ date, name }) => ({ date, name }));
  salvarFeriadosCache(ano, feriados);
  return feriados;
}
