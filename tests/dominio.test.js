/* Testes do domínio com o executor nativo do Node (node --test). Rode: npm test */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  Servico, Agendamento, AgendamentoDomiciliar, STATUS, criarAgendamento, criarGeradorProtocolo, ultimoNumeroProtocolo,
} from '../js/dominio/agendamento.js';
import { validarAgendamento, temConflito, horarioDentroDoFuncionamento, acharFeriado } from '../js/dominio/regras.js';
import { calcularFechamento, filtrarAgendamentos, porBusca, porStatus } from '../js/dominio/fechamento.js';

const lerJSON = async (caminho) => JSON.parse(await readFile(new URL(`../${caminho}`, import.meta.url), 'utf8'));
const catalogo = (await lerJSON('data/servicos.json')).map((s) => new Servico(s));
const agenda = (await lerJSON('data/agenda-exemplo.json')).map((a) => criarAgendamento(a, catalogo));

const banho = catalogo.find((s) => s.id === 'banho');
const novo = (extra = {}) => criarAgendamento({
  protocolo: 'AP-9999', tutor: 'Teste', telefone: '(11) 90000-0000', pet: 'Rex', especie: 'Cão',
  servicoId: 'banho', data: '2030-01-10', hora: '09:00', ...extra,
}, catalogo);

test('closure: o gerador de protocolo preserva o contador entre chamadas', () => {
  const proximo = criarGeradorProtocolo(7);
  assert.equal(proximo(), 'AP-0008');
  assert.equal(proximo(), 'AP-0009');
  assert.equal(ultimoNumeroProtocolo(agenda), 11);
});

test('herança: o domiciliar soma a taxa (15 na mesma cidade, 30 em outra)', () => {
  const mesmaCidade = novo({ domiciliar: true, endereco: { cep: '01310200', logradouro: 'Av. Paulista', numero: '1', bairro: 'Bela Vista', cidade: 'São Paulo', uf: 'SP' } });
  const outraCidade = novo({ domiciliar: true, endereco: { cep: '07011000', logradouro: 'Rua A', numero: '2', bairro: 'Centro', cidade: 'Guarulhos', uf: 'SP' } });
  assert.ok(mesmaCidade instanceof AgendamentoDomiciliar && mesmaCidade instanceof Agendamento);
  assert.equal(mesmaCidade.calcularValor(), banho.preco + 15);
  assert.equal(outraCidade.calcularValor(), banho.preco + 30);
  assert.equal(novo().calcularValor(), banho.preco);
  assert.match(mesmaCidade.resumo(), /Domiciliar: Av\. Paulista/);
});

test('conflito: cancelado libera o horário; ativo bloqueia', () => {
  const existente = novo();
  assert.equal(temConflito([existente], novo({ protocolo: 'AP-9998' })), true);
  existente.alterarStatus(STATUS.CANCELADO);
  assert.equal(temConflito([existente], novo({ protocolo: 'AP-9998' })), false);
});

test('funcionamento: o serviço precisa terminar até o fechamento', () => {
  assert.equal(horarioDentroDoFuncionamento('16:00', 120), true);   // termina 18:00
  assert.equal(horarioDentroDoFuncionamento('16:30', 120), false);  // terminaria 18:30
  assert.equal(horarioDentroDoFuncionamento('07:30', 30), false);   // antes de abrir
  assert.equal(horarioDentroDoFuncionamento('09:15', 30), false);   // não é de 30 em 30
});

test('validação: campos vazios, data passada e horário inválido geram erros por campo', () => {
  const vazio = validarAgendamento({}, undefined, { hoje: '2030-01-10', agora: '10:00' });
  for (const campo of ['tutor', 'telefone', 'pet', 'especie', 'servico', 'data', 'hora']) assert.ok(vazio[campo], campo);

  const dados = { tutor: 'Maria', telefone: '11988887777', pet: 'Rex', especie: 'Cão', data: '2030-01-09', hora: '07:00' };
  const erros = validarAgendamento(dados, banho, { hoje: '2030-01-10', agora: '10:00' });
  assert.match(erros.data, /já passou/);
  assert.match(erros.hora, /Fora do funcionamento/);
  assert.deepEqual(validarAgendamento({ ...dados, data: '2030-01-11', hora: '09:00' }, banho, { hoje: '2030-01-10', agora: '10:00' }), {});
});

test('validação: domiciliar exige endereço e serviço que aceite domicílio', () => {
  const adestramento = catalogo.find((s) => s.id === 'adestramento');
  const dados = { tutor: 'Maria', telefone: '11988887777', pet: 'Rex', especie: 'Cão', data: '2030-01-11', hora: '09:00', domiciliar: true, endereco: { cep: '123' } };
  const erros = validarAgendamento(dados, adestramento, { hoje: '2030-01-10', agora: '10:00' });
  assert.ok(erros.servico && erros.cep && erros.logradouro && erros.numero && erros.bairro && erros.cidade && erros.uf);
});

test('fechamento do dia (dados de exemplo)', () => {
  const f = calcularFechamento(agenda, '2026-10-20');
  assert.equal(f.total, 10);
  assert.equal(f.concluidos, 5);
  assert.equal(f.agendados, 4);
  assert.equal(f.cancelados, 1);
  assert.equal(f.faturamento, 60 + 135 + 150 + 110 + 60);   // só concluídos, com taxa domiciliar
  assert.equal(f.aReceber, 110 + 75 + 80 + 120);
  assert.equal(f.encerrado, false);
  assert.equal(f.temDomiciliar, true);
  assert.equal(f.porServico[0].servico, 'Banho');           // 3 banhos ativos (AP-0001, 0007, 0010)
  assert.equal(f.porServico[0].quantidade, 3);
  assert.equal(calcularFechamento(agenda, '2026-12-31').encerrado, false);
});

test('callback: filtrarAgendamentos aplica critérios combinados (ignora acentos)', () => {
  const doDia = agenda.filter((a) => a.data === '2026-10-20');
  assert.equal(filtrarAgendamentos(doDia, porStatus('Cancelado')).length, 1);
  assert.equal(filtrarAgendamentos(doDia, porBusca('sonia')).length, 1);        // "Sônia"
  assert.equal(filtrarAgendamentos(doDia, porStatus('Agendado'), porBusca('r')).length >= 1, true);
  assert.equal(filtrarAgendamentos(doDia, porStatus('todos'), porBusca('')).length, 10);
});

test('feriados: acharFeriado localiza pela data', () => {
  const lista = [{ date: '2026-12-25', name: 'Natal' }];
  assert.equal(acharFeriado(lista, '2026-12-25').name, 'Natal');
  assert.equal(acharFeriado(lista, '2026-12-26'), null);
});
