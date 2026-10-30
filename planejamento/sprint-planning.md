# Sprint Planning — AgendaPet Web

**Sprint:** 16/10/2026 a 02/11/2026 (Semanas 13 e 14) · **Cliente:** Patinhas & Cia · **Equipe:** 1 pessoa desenvolvedora

## Meta da sprint

> A atendente consegue **agendar com validação**, **acompanhar a agenda do dia** e **fechar o caixa** pelo celular, e a dona da loja fecha o dia **pelo terminal** com os mesmos números.

## Backlog estimado (pontos de história: 1, 2, 3, 5, 8)

| Ordem | Ticket | História | Pts | Por que nessa ordem |
|---|---|---|---|---|
| 1 | US01 | Estrutura semântica e acessível | 2 | Base de tudo: o HTML define os ids que o JS vai usar |
| 2 | US10 | Layout responsivo e identidade visual | 5 | Fazer o CSS cedo evita refazer a tela depois (mobile-first) |
| 3 | US02 | Catálogo de serviços (`fetch`) | 3 | O formulário depende do catálogo |
| 4 | US03 | Formulário de novo agendamento | 5 | Núcleo do produto |
| 5 | US07 | Regras de negócio (classes, conflito, fechamento) | 8 | Maior risco técnico: começar cedo e testar no Node |
| 6 | US06 | Agenda do dia (lista, busca, filtros, atalhos) | 5 | Precisa das classes da US07 |
| 7 | US04 | Endereço por CEP (ViaCEP) | 3 | Depende do formulário (US03) |
| 8 | US05 | Alerta de feriados (BrasilAPI + cache) | 3 | Depende do formulário e do `storage` |
| 9 | US08 | Persistência e exportação (`localStorage`) | 3 | Só faz sentido com agenda funcionando |
| 10 | US09 | Relógio e lembretes (timers) | 3 | Depende da agenda e do domínio |
| 11 | US11 | Projeto Node.js, ESM e CommonJS | 5 | Reaproveita o domínio já pronto |
| 12 | US12 | Depuração e relatório de bug | 2 | Usa os scripts de Node da US11 |
| | | **Total** | **47** | |

## Riscos e plano B

| Risco | Plano |
|---|---|
| ViaCEP ou BrasilAPI fora do ar durante a demonstração | Já previsto na regra: preenchimento manual do endereço e aviso de feriado indisponível; cache de feriados por 30 dias |
| US07 (8 pts) estourar o tempo | Entregar primeiro conflito + valor domiciliar; deixar o relatório por serviço para o final |
| Layout quebrar em 360px | Conferir a largura a cada ticket (DevTools, modo celular) |
| Falta de tempo no fim | **Cortaria:** exportação como arquivo (bônus), estilos de impressão (bônus) e testes automáticos — nunca os requisitos obrigatórios |

## Definição de Pronto para Iniciar (cartão)

- [x] História lida e critérios de aceite entendidos
- [x] Ticket estimado em pontos
- [x] Branch criada no padrão `tipo/US##-descricao`

## Cerimônias

| Data | O que | Resultado |
|---|---|---|
| 16/10 | Sprint Planning | Este documento + Kanban com 12 cartões |
| 20, 22, 23/10 | Mentoria Semana 13 | US01, US10, US02, US03, US07, US06 |
| 27, 29/10 | Mentoria Semana 14 | US04, US05, US08, US09, US11, US12 |
| 30/10 | Review com o mentor + Retrospectiva | Ajustes, README e retrospectiva |
| 02/11 | Entrega no AVA | Repositório, Kanban e vídeo (Sprint Review) |
