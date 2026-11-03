# Análise geral — modularização e desempenho

Auditoria de 02/11/2026, America/Maceio. Projeto Supabase autorizado: `enhoierfwuwtzulznjxa`.

**Continuação:** este documento preserva o diagnóstico anterior à implementação. As correções autorizadas depois estão registradas em [Correção geral de desempenho](2026-11-02-correcao-geral.md).

## Conclusão

**A modularização avançou e o limite de tamanho dos arquivos foi validado. A otimização de execução do sistema inteiro ainda está incompleta.** A conclusão anterior foi ampla demais ao estender as melhorias de alguns fluxos ao sistema todo.

Há gargalos concretos fora de Encartes: imagens originais usadas como prévias, listas operacionais com documentos completos, gravação por tecla, invalidação ampla de cache, repetição de leituras pelo eco Realtime e reconstruções de interface. Esses mecanismos se combinam e explicam trabalho desnecessário durante abertura, edição e exclusão. Não foi medido o tempo visual de cada tela no Safari para atribuir uma porcentagem de demora a cada mecanismo.

As leituras pequenas atuais do banco não demonstraram lentidão generalizada do PostgreSQL. Isso não prova que todas as escritas sejam rápidas: o histórico de gravações mistura versões e módulos, e faltam amostras atuais por operação. Não há evidência suficiente para recomendar aumentar o plano do Supabase, elevar timeouts ou reescrever a stack.

## Divisão da revisão

Foram utilizados três agentes, com revisão transversal e consolidação pelo agente principal:

| Frente | Cobertura | Relatório |
| --- | --- | --- |
| Operações | Cotação, Hortifruti, Açougue e Devoluções; listas, detalhes, gravação, autosave e exclusão | [Operações](2026-11-02-operacoes.md) |
| Cadastros e gestão | Produtos, Parceiros, Categorias, Unidades, Biblioteca, Modelos, Calendário, Promoções, Tabela de preços, Início e Configurações | [Cadastros e gestão](2026-11-02-cadastros-e-gestao.md) |
| Backend e Supabase | RPCs, payloads, imagens, consultas, histórico de execução, autorização e publicação Realtime | [Banco](2026-11-02-banco.md) |
| Revisão transversal | Build, abertura de rotas, dependências, TanStack Query Core, cache, eco Realtime e servidor local | [Infraestrutura frontend](2026-11-02-infraestrutura-frontend.md) |

Skills relevantes já disponíveis foram carregadas: senior-frontend, senior-backend, senior-fullstack, Supabase, Supabase Postgres Best Practices e TanStack Query Best Practices. Nenhuma dependência de produção precisou ser instalada para realizar a auditoria.

O acesso remoto foi feito pela CLI oficial autenticada, exclusivamente no projeto autorizado. Não foi utilizado navegador para operar o Supabase. Esta rodada não alterou dados comerciais, SQL remoto ou código da aplicação; produziu relatórios e diagnósticos. O build regenerou a saída local de distribuição.

## Principais achados e evidências

P1 significa primeira rodada de correção; P2 significa rodada seguinte ou medição dirigida. A prioridade combina abrangência e trabalho evitável; não é um ranking de milissegundos medidos em todas as telas.

| Prioridade | Problema | Evidência | Consequência |
| --- | --- | --- | --- |
| P1 | Prévia de produto retorna original | Quatro produtos legados com fotos maiores retornaram **3.423.880 bytes** em consulta remota autenticada | Cadastro e seletores podem transferir megabytes para exibir pequenas imagens |
| P1 | Listas operacionais retornam documentos completos e sem paginação remota | Uma cotação retornou **135.375 bytes**; contrato genérico agrega todo o histórico | Abertura e atualização crescem com itens/documentos que a lista não apresenta |
| P1 | Promoções e Hortifruti gravam durante digitação | Handler real de Promoções: **10 inputs + 1 change = 11 chamadas de gravação**, com transporte simulado; Hortifruti chama setPricing por input | Fila persiste estados intermediários e prolonga o salvamento |
| P1 | Mutação local e evento próprio repetem atualização | API real + Query Core com transporte simulado: **1 save + 2 leituras de atualização**, quando o eco chega depois do primeiro refresh | Respostas e reconstruções se repetem; não ocorre necessariamente em toda mutação |
| P1 | Cache de snapshots é removido por recurso inteiro | Ensaio sintético com 200 cotações: após mudar uma, releitura voltou a assinar **995 URLs** de outras fotos | Alterar preço provoca trabalho de mídia não alterada; o ensaio não baixou pixels nem mediu rede |
| P1 | Entrega do código não acompanha a modularização | Build copia módulos próprios; amostra de Cotação acrescenta 49 arquivos JS, Hortifruti 40 e Encartes 54 ao grafo estático inicial | Muitos pedidos/descoberta de dependências em cache frio; contagens são análise de grafo, não captura de rede |
| P2 | Busca e exclusões refazem regiões grandes | Tabela recria módulo em cada tecla; Biblioteca atualiza metadados e grade após excluir, além do watcher | Perda de continuidade visual e trabalho desnecessário |
| P2 | Abertura tem dependências sequenciais | Cinco rotas esperam unidades/parceiros antes de importar o módulo | Latência de catálogo entra no caminho crítico de páginas que poderiam começar antes |
| P2 | Biblioteca reenvia binário para renomear | Serviço busca registro completo e reenvia dataURL mesmo quando só nome/categoria mudam | Edição de texto pode carregar e reenviar imagem original |

As contagens de arquivos são da fotografia de 03:28:34 UTC. Os relatórios individuais preservam o método, referências de código e limitações de cada reprodução.

## Situação por área

| Área | Avaliação atual |
| --- | --- |
| Cotação | Detalhe individual melhorou; lista pesada e atualização ampla da matriz permanecem |
| Hortifruti | Há carregamento por necessidade e previews visíveis; precificação/autosave ainda acumulam gravações |
| Açougue | Paginação visual existe, mas todo histórico é consultado; criação volta a ler a lista |
| Devoluções | Detalhe individual e prévia com debounce; lista completa e catálogo repetido nos seletores |
| Promoções | Lista completa antes de paginar; gravação por tecla é prioridade |
| Tabela de preços | Lista completa, busca reconstrói módulo e abertura pode disparar comando de arquivamento |
| Calendário | Carrega campanhas completas e resolve mídia embora só necessite resumo/datas |
| Produtos | Paginação remota, debounce e metadados separados são bons; prévias originais ainda pesam |
| Biblioteca | Metadados e carregamento de previews por visibilidade melhoraram; edição/exclusão ainda repetem trabalho |
| Demais cadastros | Listas completas e filtros locais; priorizar conforme volume, sem otimizar Unidades/Perfis pequenos prematuramente |
| Início e Configurações | Consultas por finalidade e algumas atualizações parciais; nenhum P1 específico confirmado nesta leitura |
| Encartes | Biblioteca resumida medida em 609 bytes; melhorias anteriores existem, mas não comprovam otimização de todos os demais domínios |
| Infraestrutura comum | Query Core e Realtime compartilhados estão presentes; granularidade de cache, build e navegação precisam avançar |

## O que já está funcionando e deve ser preservado

- Organização por domínio e divisão em services, queries, hooks e views nos fluxos revisados. O build conferiu **307 arquivos da aplicação dentro do limite de 500 linhas** e **239 módulos no grafo de runtime**, na fotografia validada. Isso não significa que toda responsabilidade arquitetural esteja perfeita nem que todos os módulos sejam carregados inicialmente.
- Um QueryClient, chaves por empresa, deduplicação de leituras simultâneas, controle de versão e limpeza de contexto. Realtime publica sinais pequenos por recurso, não documentos comerciais inteiros.
- Produtos já possui paginação remota; Biblioteca e Encartes têm projeções menores; detalhes de operações usam leitura por ID.
- Todas as 27 tabelas públicas inspecionadas tinham RLS habilitado. As 18 RPCs públicas inspecionadas não concediam execução a anon. A verificação de configuração não substitui testes completos de isolamento.
- Nenhum `location.reload()` identificado na aplicação. O sintoma relatado tem base em refetch e reconstrução de DOM, que também podem esvaziar/piscar a tela sem recarregar o documento HTML.

## Sequência de correção recomendada

1. **Reduzir chamadas por interação:** consolidar autosave, eliminar repetição por change/eco Realtime e aplicar retorno da mutação apenas ao registro afetado. Manter lista visível durante exclusão/revalidação; tratar falha sem perder o estado digitado. Preservar `_version` e eventos de outros usuários.
2. **Reduzir dados transferidos:** miniaturas reais, versionadas e limitadas; separar metadados e binários; preservar cache de mídia válida. Migrar imagens legadas com rastreabilidade e preservação de originais/referências históricas.
3. **Limitar trabalho por página:** RPCs resumidas/paginadas para operações; documentos completos só no detalhe; Calendário filtrado por período; fotos apenas quando usadas. Totais e regras continuam no PostgreSQL.
4. **Melhorar abertura e interface:** empacotar entrega com divisão por rota, paralelizar dependências necessárias, manter shell/controles estáveis, cancelar leituras obsoletas quando não compartilhadas e atualizar DOM por registro.
5. **Medir aceite em cada módulo:** abertura fria/quente, busca, edição, salvamento e exclusão. Registrar requests, bytes, primeiro resultado útil, tempos de banco/rede/Storage/interface e p50/p95 em massa de teste representativa. Ajustar índices somente quando planos e volume demonstrarem necessidade.

Critérios mínimos: uma digitação contínua não gera save por tecla; exclusão não esvazia a lista inteira; Calendário não resolve fotos; editar preço não reassina mídia intacta; primeira página não consulta todo histórico; sinal de outro usuário continua atualizando corretamente; arquivos de autoria permanecem dentro do limite de 500 linhas.

Metas propostas de experiência, ainda não verificadas: LCP p75 até 2,5 s, INP p75 até 200 ms e CLS até 0,1, com ambiente e conexão documentados. Não há promessa de redução percentual sem medir o mesmo cenário antes e depois.

## Validação e limites da conclusão

- `npm test`: **505 aprovados, 13 ignorados, nenhuma falha**.
- `npm run test:db`: **13 suítes aprovadas**.
- `npm run build`: aprovado, incluindo limite de linhas e grafo de módulos.
- `git diff --check`: aprovado na verificação.
- Leituras atuais pequenas: página de produtos 6,68 ms; cotação 21,76 ms; resumo do Início 45,29 ms **dentro do banco**, sem rede/UI. São amostras, não p95 nem tempos de abertura.
- Hortifruti, Açougue, Devoluções, Promoções, Tabelas e Calendário estavam sem registros operacionais no inventário. Não é possível comprovar seu desempenho em escala com tabelas vazias.
- Não foi feita medição visual autenticada no Safari nem teste de carga multiusuário. Os testes funcionais aprovados não certificam velocidade ou publicação.
- Outras sessões alteraram código durante a auditoria. A preservação de cache de mídia de Produtos, corrigida nesse intervalo, foi retirada das pendências atuais; a invalidação ampla de snapshots permanece. Os testes e contagens são fotografias do estado verificado, não validação automática de alterações posteriores.
- Não houve deploy ou aplicação de migrações nesta rodada. Nenhuma das correções propostas acima é apresentada como executada pela auditoria.

Evidências completas: [artefatos da auditoria](../../artifacts/auditoria-sistema-20261102/), incluindo logs de testes/build, contagens de chamadas, payloads e planos sanitizados. Os relatórios das quatro frentes contêm referências detalhadas aos arquivos e consultas.
