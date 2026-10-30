/* ==========================================================================
   storage.js — TODO o acesso ao localStorage mora aqui (nenhum outro arquivo
   chama localStorage direto). Guarda só texto: usamos JSON.stringify/parse.
   ========================================================================== */

const PREFIXO = 'agendapet:';   // evita misturar com dados de outros sistemas do mesmo site

export const CHAVES = Object.freeze({
  agenda: `${PREFIXO}agenda`,
  filtro: `${PREFIXO}filtro`,
  tema: `${PREFIXO}tema`,
});

/* Lê e converte. Se não existe OU está corrompido, devolve o valor padrão
   (a página nunca quebra por causa de um dado ruim no localStorage). */
export function lerJSON(chave, padrao) {
  try {
    const bruto = localStorage.getItem(chave);
    return bruto === null ? padrao : JSON.parse(bruto);
  } catch {
    return padrao;
  }
}

/* Devolve true/false: pode falhar (modo privado, armazenamento cheio). */
export function salvarJSON(chave, valor) {
  try {
    localStorage.setItem(chave, JSON.stringify(valor));
    return true;
  } catch {
    return false;
  }
}

/* ---------- Agenda ---------- */

/* Só aceita uma lista de objetos; qualquer outra coisa vira lista vazia. */
export function lerAgenda() {
  const valor = lerJSON(CHAVES.agenda, []);
  return Array.isArray(valor) ? valor.filter((item) => item && typeof item === 'object') : [];
}

export const salvarAgenda = (agendamentos) => salvarJSON(CHAVES.agenda, agendamentos.map((a) => a.paraJSON()));

/* ---------- Preferências ---------- */

const FILTROS = ['todos', 'Agendado', 'Concluído', 'Cancelado'];

export const lerFiltro = () => {
  const filtro = lerJSON(CHAVES.filtro, 'todos');
  return FILTROS.includes(filtro) ? filtro : 'todos';   // valor estranho no storage vira "todos"
};
export const salvarFiltro = (filtro) => salvarJSON(CHAVES.filtro, filtro);

export const lerTema = () => (lerJSON(CHAVES.tema, 'claro') === 'escuro' ? 'escuro' : 'claro');
export const salvarTema = (tema) => salvarJSON(CHAVES.tema, tema);

/* ---------- Cache de feriados (com validade) ----------
   Guardamos { salvoEm, feriados } por ano. Se passou da validade, ignoramos. */

const chaveFeriados = (ano) => `${PREFIXO}feriados:${ano}`;

export function lerFeriadosCache(ano, validadeMs) {
  const cache = lerJSON(chaveFeriados(ano), null);
  const valido = cache && Array.isArray(cache.feriados) && Date.now() - Number(cache.salvoEm) < validadeMs;
  return valido ? cache.feriados : null;
}

export const salvarFeriadosCache = (ano, feriados) => salvarJSON(chaveFeriados(ano), { salvoEm: Date.now(), feriados });

/* ---------- Limpar ----------
   Remove SOMENTE as chaves desta aplicação (as que começam com o prefixo). */
export function limparDados() {
  const minhas = Object.keys(localStorage).filter((chave) => chave.startsWith(PREFIXO));
  minhas.forEach((chave) => localStorage.removeItem(chave));
  return minhas.length;
}
