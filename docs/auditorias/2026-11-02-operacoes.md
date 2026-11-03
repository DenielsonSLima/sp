# Auditoria de desempenho — operações

Data: 02/11/2026. Escopo: Cotação, Hortifruti, Açougue e Devoluções. Revisão de código e diagnóstico local, sem alterar aplicação ou banco, sem navegador e sem operações remotas.

**Conclusão:** a separação por domínio existe e há melhorias reais de carregamento de detalhes e ciclo de vida. Entretanto, estes quatro módulos ainda não podem ser considerados integralmente otimizados. Persistem listas com documentos completos, preparação desnecessária de mídia, invalidação ampla e gravações excessivas durante edição. Dividir arquivos não resolve esses custos.

## Método e limites

- Skill utilizada: `.agents/skills/senior-frontend/SKILL.md`, junto a `AGENTS.md` e `docs/SKILLS.md`.
- Fluxos revisados: entrada, lista, filtros, detalhe, criação, gravação, autosave e assinatura Realtime.
- “Comprovado no código” significa comportamento presente nos arquivos locais atuais; não prova que a mesma migração está aplicada remotamente.
- “Medido localmente” abaixo usa a API real do projeto com transporte RPC/Storage simulado. Conta operações; não mede rede, tempo de PostgreSQL, Safari ou produção. O cenário de 200 registros é sintético, não a quantidade do cliente.
- Não houve medição de LCP/INP, memória do navegador, planos SQL ou p95 remoto nesta frente. A auditoria de banco e a do shell são frentes separadas.
- Hipótese de uso para validação futura: desktop/Safari mostrado pelo usuário, sessão autenticada e rede comum da loja. A reprodução não usa credenciais.

## Cobertura por módulo

| Módulo | O que já está melhor | Custo ainda presente |
| --- | --- | --- |
| Cotação | Detalhe usa `sp_get`; produto e fornecedor são carregados conforme necessidade; gravação de preço por blur/Enter evita dupla confirmação | Listagem recebe snapshots completos e assina fotos; digitação percorre a matriz inteira; lista sem paginação remota |
| Hortifruti | Detalhe individual; templates carregados na aba de precificação; previews do seletor observam visibilidade; remoção de produto atualiza o card local | Precificação grava a cada tecla; autosave não agrupa alterações enquanto há requisição; troca de aba aguarda salvamento; lista completa com mídia |
| Açougue | 12 cards por página visual; modelos carregados ao criar; cálculos mantidos em RPC | Paginação somente no cliente; todos os recebimentos são baixados/clonados; criação relê a lista toda; estimativas podem se sobrepor |
| Devoluções | Detalhe individual; prévia de total tem debounce e descarta resposta obsoleta | Lista completa com mídia; catálogo inteiro repetido em cada seletor de item; prévias em andamento não são canceladas |

## Achados priorizados

### P1-OPS-01 — listas baixam documentos completos e esperam preparação de fotos que os cards não exibem

**Evidência de código:** `shared/data/queries/records.js:30` chama `sp_list`; `:42` executa `hydrateSnapshotMedia` antes de devolver a lista. `shared/data/resources.js:28` inclui quotes, hortifruti_receipts e supplier_returns. A definição local mais recente de `sp_private.list_records`, em `supabase/migrations/20261031031813_optimize_product_media_rpc.sql:18`, agrega `data` completo por empresa, sem limite/paginação para esses recursos e butcher_receipts. `shared/data/media/products.js:48` resolve assinaturas em lotes de 100, sequencialmente.

**Impacto:** abertura cresce com todo o histórico, itens, histórico de preços e referências de imagens. A tela aguarda trabalho que não precisa para os cards. Em Açougue, a página de 12 itens reduz DOM, mas não reduz dados transferidos: `interno/acougue/list.js:13` filtra a coleção já carregada e `:22` faz slice local.

**Medição local:** 200 cotações com cinco referências de fotos distintas cada geraram 1 RPC de lista e 10 chamadas de assinatura, envolvendo 1.000 URLs, antes de a lista terminar. Nenhuma foto binária foi baixada nesse ensaio; o custo comprovado é preparação de URLs e documentos.

**Proposta:** RPCs de listagem por domínio com projeção de card, filtro/ordem e cursor no servidor; cache por empresa/filtro/página; `sp_get` para documento completo; assinatura de mídia somente no detalhe/preview visível. Manter totais e regras no backend.

### P1-OPS-02 — qualquer alteração de documento elimina o cache de mídia de todo o recurso

**Evidência de código:** `shared/data/api.js:124` remove todas as queries `snapshot_media` daquele recurso; `shared/data/queries/records.js:99` invalida após mutação e `:102` reidrata mídia da resposta completa.

**Impacto:** editar um preço, sem alterar foto, força novas assinaturas. Ao atualizar a lista, fotos dos demais documentos precisam ser assinadas novamente. O custo aumenta ainda mais quando o mesmo recurso recebe evento Realtime.

**Medição local:** após o cenário anterior, uma alteração simulada em uma cotação gerou 1 RPC e 1 assinatura de lote contendo 5 URLs; a releitura da lista gerou outro RPC e mais 10 lotes contendo 995 URLs. Resultado independente de latência de rede e de banco.

**Proposta:** separar invalidação de dados da invalidação de mídia; preservar URL por empresa/bucket/path/versão do asset e validade; invalidar mídia somente quando referência/foto mudar ou expirar. Atualizar registro e card pelo retorno da mutação; revalidar lista sem esvaziá-la. Preservar limpeza completa ao trocar empresa/sessão.

### P1-OPS-03 — precificação do Hortifruti grava a cada tecla e forma fila

**Evidência de código:** `interno/hortifruti/pricing.js:121` chama `apply({})` em cada evento input de preço; `:130` faz o mesmo em quantidade de cartazes. `apply`, em `:94`, chama `store.setPricing`. `interno/operational-store.js:128` clona cada payload e `:154` encadeia cada comando numa fila, sem substituir edições intermediárias.

**Impacto:** digitar um valor gera várias RPCs serializadas. Cada uma ainda pode executar o trabalho de mídia descrito acima. O usuário termina de digitar, mas a aplicação continua salvando estados intermediários; a fila também retarda outras ações no mesmo recurso. A fila protege versão concorrente, mas precisa receber menos comandos.

**Proposta:** estado visual imediato; confirmação por blur/Enter ou debounce; enquanto um save está em andamento, manter apenas a última edição pendente por registro/campo. Flush explícito antes de imprimir/finalizar, com erro visível e `_version` correta. Não mover cálculo comercial para o navegador.

### P2-OPS-04 — autosave do Hortifruti não agrupa enquanto salva; navegação interna espera rede

**Evidência de código:** `interno/hortifruti/autosave.js:11` inicia save mesmo se já houver outro em andamento para o mesmo ID; `:27` só substitui a referência do último pending. Há debounce de 200 ms antes do início (`:1`, `:42`), mas não coalescência durante a requisição. `interno/hortifruti/detail.js:47` aguarda `auto.flush` antes de renderizar; trocar aba passa novamente por essa função (`:145`). Finalização aguarda flush, update completo e finalize em sequência (`:276`).

**Medição local:** com save artificialmente suspenso, quatro edições separadas por intervalos maiores que o debounce iniciaram quatro callbacks de save antes de liberar a primeira resposta. No módulo real, a camada operational-store serializa os comandos; o achado é acúmulo de fila, não quatro RPCs paralelas garantidas.

**Proposta:** uma requisição ativa e uma versão pendente consolidada por documento; abas devem renderizar imediatamente o draft local e indicar pendência; ações de negócio aguardam o flush. Avaliar uma RPC atômica de atualizar/finalizar ou evitar update redundante quando não há alteração.

### P2-OPS-05 — filtros/listas e a matriz de Cotação refazem trabalho sobre toda a coleção

**Evidência de código:** `interno/cotacao/list.js:29`, `interno/hortifruti/list.js:28` e `interno/devolucoes-fornecedores/list.js:14` substituem todo o grid com innerHTML nas atualizações. Não há paginação remota nessas listas. `interno/operational-store.js:114` percorre e clona a coleção inteira a cada list(). Em Açougue, `interno/acougue/views/list.js:14` clona a coleção para mostrar apenas uma página; o estado vazio pede novas cópias (`:25`).

Na Cotação, `interno/cotacao/detail.js:91` percorre todos os formulários da matriz para atualizar badges/histórico/totais e `:121` recria o rodapé. `interno/cotacao/detail-autosave.js:41` aciona atualização visual durante a edição do draft. O custo por tecla cresce com itens × fornecedores, embora o valor digitado pertença a uma célula.

**Impacto:** mais processamento, alocação de memória e substituição de DOM; crescimento com histórico e matrizes grandes. Não foi medido travamento em Safari, portanto a severidade prática depende dos volumes reais.

**Proposta:** projeções pequenas e paginação remota; filtros com cancelamento de busca anterior; reconciliação por ID; não clonar a coleção inteira para ler contador/item. Na matriz, atualizar apenas célula/linha afetada e resumo derivado do retorno de RPC; virtualizar quando o volume justificar.

### P2-OPS-06 — chamadas e DOM evitáveis em Açougue e Devoluções

- **Açougue:** `interno/cadastros/acougue/state.js:40` cria recebimento e depois aguarda `loadButcherReceipts()` completo. Incorporar o retorno ao cache e revalidar em segundo plano evita bloquear confirmação na lista inteira. `interno/acougue/views/create.js:131` agenda estimativa ao input do formulário inteiro; debounce descarta trabalho antes de começar, mas não cancela RPC já iniciada. Restringir aos campos de cálculo e consolidar a última prévia.
- **Devoluções:** `interno/devolucoes-fornecedores/create.js:40` inclui todos os produtos como options em cada linha. Custo cresce como linhas × tamanho do catálogo. Usar uma fonte compartilhada e seletor pesquisável limitado/paginado. `:14` possui debounce e proteção contra resposta obsoleta, mas requisições já iniciadas ainda executam: adicionar cancelamento/coalescência respeitando os cálculos no backend.
- **Proteção de mutação:** `interno/devolucoes-fornecedores/create.js:52` não bloqueia novo submit enquanto salva; clique repetido pode enfileirar criação repetida. Adicionar estado pending e idempotência no comando é recomendável junto da otimização.

## O que foi validado e deve ser preservado

- Organização dos domínios em services/queries/hooks/views; não propor reescrita em React como requisito de desempenho.
- Detalhes de Cotação/Hortifruti/Devoluções já têm leitura individual. Não generalizar o problema de lista completa para todas as rotas de detalhe.
- Query Core deduplica fetches e aplica staleTime; store protege `_version`, mudanças de contexto e listas que chegam depois de mutações.
- Hooks de lista usam assinatura por recurso e limpam observadores quando o root sai; não foi encontrado vazamento evidente e ilimitado de listeners nesses fluxos.
- O seletor de produtos do Hortifruti carrega previews por visibilidade e limita concorrência. Isso não evita a hidratação ampla dos snapshots na listagem.
- A remoção de produto no detalhe de Hortifruti atualiza o card local; não apaga toda a tela em todos os casos. O problema global tem mecanismos específicos, não um único `location.reload` em todas as operações.

Verificação executada:

```sh
node --test tests/operational-store.test.mjs tests/domain-loading.test.mjs tests/hortifruti-autosave.test.mjs tests/quotation-offer-input.test.mjs tests/product-storage.test.mjs
```

Resultado: **47 testes passaram; 0 falhas; 0 ignorados**. São testes funcionais/lógicos; não comprovam tempo de resposta remoto. Não foi necessário build nesta frente, pois nenhum código de aplicação foi alterado.

Reprodução dos contadores locais: `node docs/auditorias/probes/operacoes-performance.mjs`. O transporte é falso, sem acesso remoto, e o script usa a API e o autosave atuais do projeto. Resultados esperados nesta revisão:

| Etapa sintética | RPCs | Lotes de assinatura | Caminhos assinados |
| --- | ---: | ---: | ---: |
| Primeira lista | 1 | 10 | 1.000 |
| Uma mutação | 1 | 1 | 5 |
| Releitura da lista | 1 | 10 | 995 |

## Ordem proposta e critérios de aceite

1. Eliminar gravação por tecla e agrupar autosave durante requisição; medir RPCs por edição.
2. Separar mídia dos snapshots e sua invalidação; editar preço não pode assinar fotos novamente se a mídia não mudou.
3. Criar consultas de cards paginadas, começando pelos maiores históricos; primeira página de lista não deve preparar fotos de documentos não exibidos.
4. Tornar atualização de listas incremental, reduzir clones e limitar seletores/matrizes.
5. Validar abertura fria/quente, digitação, salvamento e exclusão nas quatro áreas com volumes reais e rede controlada; registrar payload, número de RPCs, chamadas Storage e p50/p95.

Metas propostas para validação, **ainda não medidas**: INP p75 ≤ 200 ms; busca/renderização local sem tarefas longas > 50 ms; lista mantém conteúdo durante mutação/revalidação; uma edição contínua não gera uma RPC por tecla; navegação de aba independente do tempo de save. Metas de LCP/bundle devem ser consolidadas na auditoria do shell.

Referência cruzada: a frente principal também encontrou carregamento prévio de catálogos no shell e reproduziu invalidação local + eco Realtime causando duas releituras. Esses pontos são reportados separadamente e potencializam os custos das listas descritas aqui; não são novas medições feitas por esta frente.
