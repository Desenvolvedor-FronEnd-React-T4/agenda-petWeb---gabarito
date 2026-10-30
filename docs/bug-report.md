# Relatório de bug — BUG-01

| Campo | Valor |
|---|---|
| **Título** | Fechamento do dia mostra faturamento maior que o valor dos atendimentos concluídos |
| **Ticket relacionado** | US07 – Regras de negócio e fechamento do dia |
| **Onde apareceu** | `npm run fechamento` (e a mesma função alimenta a tela de Fechamento) |
| **Branch da correção** | `fix/US07-faturamento-concluidos` (PR #8) |
| **Gravidade** | Alta — o dono da loja conferiria o caixa com um número errado |

## Passos para reproduzir

1. Na raiz do projeto, rode: `npm run fechamento`
2. Observe as linhas **"Faturamento (concluídos)"** e **"A receber (agendados)"** do dia 20/10/2026.

## Resultado esperado × obtido

| | Esperado | Obtido (com o bug) |
|---|---|---|
| Faturamento (concluídos) | **R$ 515,00** (5 atendimentos concluídos: 60 + 135 + 150 + 110 + 60) | **R$ 900,00** |
| A receber (agendados) | R$ 385,00 | R$ 385,00 |

Pista: 900 = 515 + 385. O faturamento estava **incluindo o valor que ainda seria recebido** (os 4 agendados), e isso é inconsistente com a própria linha de "A receber".

## Investigação com o depurador

Configuração usada: **"Depurar fechamento do dia (Node)"** em `.vscode/launch.json` (tecla **F5**).

1. **Breakpoint** na linha do `reduce` do faturamento em `js/dominio/fechamento.js` (dentro de `calcularFechamento`).
2. Ao pausar, olhei **Variables/Watch**:

   | Expressão (Watch) | Valor |
   |---|---|
   | `doDia.length` | 10 |
   | `ativos.length` | **9** (concluídos + agendados; só o cancelado fica de fora) |
   | `concluidos.length` | **5** |
   | `ativos.reduce((t, a) => t + a.calcularValor(), 0)` | **900** |
   | `concluidos.reduce((t, a) => t + a.calcularValor(), 0)` | **515** |

3. **Call Stack:** `calcularFechamento` ← `main` (`scripts/fechamento-dia.js`) — o erro está na regra, não no script.
4. Um **breakpoint condicional** (`a.status === 'Agendado'`) dentro do callback do `reduce` pausou 4 vezes, provando que atendimentos **Agendados** estavam sendo somados.

Evidência: [depuracao.png](depuracao.png)

## Causa raiz

A soma do faturamento usava a lista **`ativos`** (agendados + concluídos) em vez de **`concluidos`**:

```js
// ANTES (bug)
const faturamento = ativos.reduce((total, a) => total + a.calcularValor(), 0);

// DEPOIS (correto)
const faturamento = concluidos.reduce((total, a) => total + a.calcularValor(), 0);
```

O erro aconteceu porque eu reaproveitei `ativos` (usada no agrupamento por serviço) sem lembrar que **faturar é receber, e só o concluído foi recebido**.

## Correção

- Commit: `fix(US07): soma só atendimentos concluídos no faturamento`
- Teste que protege a regra (em `tests/dominio.test.js`): `fechamento do dia (dados de exemplo)` — confere `faturamento === 515` e `aReceber === 385`. Rode `npm test`.

## Como evitar de novo

- Nomes mais explícitos para as listas (`concluidos`, `agendados`) e uma regra escrita no README ("faturamento = só concluídos").
- Teste automático com os dados de exemplo antes de abrir o Pull Request.
