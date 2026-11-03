# Auditoria de Cadastros e Gestão — 02/11/2026

## Conclusão

A separação em módulos existe, mas a otimização de execução ainda é desigual. Produtos, Início e as configurações individuais já têm escolhas melhores de carregamento e atualização. Promoções, Calendário, Tabela de preços e parte dos Cadastros continuam fazendo trabalho desnecessário. Separar arquivos, por si só, não reduz o volume consultado nem evita refazer listas após uma mutação.

Auditoria de leitura do código local; nenhum dado remoto, tela do navegador ou código da aplicação foi alterado por este agente. Foram aplicadas as orientações de `senior-fullstack` e `tanstack-query-best-practices`, respeitando JavaScript modular, Query Core único e regras comerciais nas RPCs. A análise transversal e a verificação do Supabase estão nos relatórios dos outros agentes.

Não foram medidos LCP/INP, tempo real de RPC ou bytes atuais da empresa neste recorte. Impactos abaixo separam comportamento comprovado do código de impacto dependente do volume. As linhas refletem o estado lido nesta auditoria; há outra sessão trabalhando no repositório.

## Achados prioritários

### 1. P1 — Promoções salva o nome de produto a cada tecla e novamente ao sair do campo

- Evidência: `interno/promocoes/views/products.js:50` associa `updateItem` ao `oninput`; `:62` reutiliza o mesmo handler no `onchange`. `interno/operational-store.js:126` captura cada payload e `:154` enfileira todos; não há descarte de valores intermediários.
- Reprodução determinística usando o handler real e DOM/store simulados: **10 eventos de digitação + 1 change produziram 11 chamadas `updateItem`**, incluindo duas gravações do nome final. Evidência: `artifacts/auditoria-sistema-20261102/campaign-input-fanout.json`. Isso comprova a multiplicação de chamadas, não o tempo do Supabase.
- Impacto: uma edição curta gera fila de gravação, invalidações e reconciliação de versões; em rede lenta a fila pode continuar muito depois da digitação. O recurso ainda carrega snapshots de campanha, agravando o custo.
- Correção: debounce por campo, no máximo uma gravação em andamento e apenas o último valor pendente; flush ao sair/salvar, com comparação do último valor persistido. Preservar `_version`, o texto digitado e o erro até confirmação correta.
- Critério de aceite: digitação contínua de 10 caracteres resulta em uma gravação final; se já houver gravação em voo, no máximo mais uma com o último valor. `change` não duplica o valor já persistido.

### 2. P1 — Listas de Promoções/Tabela e Calendário esperam documentos completos e resolução de fotos

- Evidência: `interno/promocoes/index.js:34` e `interno/tabela-precos/index.js:27` aguardam a lista completa antes de mostrar os registros. Seus `queries.js:4` usam o operational store e `shared/data/queries/records.js:18`/`:42` consulta `sp_list` e hidrata os recursos de snapshot.
- `shared/data/resources.js:28` inclui `campaigns` e `price_tables` nos recursos com snapshot. `shared/data/media/snapshots.js:5` clona o conjunto, percorre todos os documentos e `:37` espera `resolveMediaBatch` das fotos ausentes. Assinar URLs/resolver metadados de mídia é trabalho adicional; não equivale necessariamente a baixar os pixels de todas as fotos.
- Promoções pagina somente depois da carga: `interno/promocoes/state.js:21` filtra a coleção completa e `:28`–`:30` recorta 12 cards no cliente. Os cards de `interno/promocoes/index.js:52` só exibem nome, datas, quantidade e notas.
- `interno/calendario/queries.js:5` carrega todas as campanhas junto dos eventos; `interno/calendario/model.js:88`–`:104` projeta somente ID, nome, datas e notas. Calendário depende de fotos e itens comerciais que não apresenta.
- Impacto: o primeiro acesso e as invalidações escalam com o histórico e itens de todas as campanhas, não com os registros visíveis. O calendário pode parecer lento por causa de outro módulo.
- Correção: RPCs de resumo paginadas para listas; detalhe por ID apenas ao abrir; eventos/campanhas filtrados pelo período visível no servidor. Fotos e snapshots completos só no detalhe, edição ou impressão que os utiliza. A classificação comercial continua no backend.
- Critério de aceite: abrir Calendário não dispara resolução de fotos; abrir a lista de campanhas não transfere `items` completos; trocar página consulta apenas a página necessária.

### 3. P2 — Tabela de preços reconstrói o módulo inteiro em cada tecla de busca

- Evidência: `interno/tabela-precos/index.js:95`–`:101` chama `list(root)` a cada `input`. `:44`–`:59` encerra o watcher, clona/filtra a coleção e substitui `root.innerHTML`; `:192` reinstala o watcher. `:70` monta todos os resultados, sem paginação.
- Impacto: digitar recria controles, linhas, foco e assinaturas da tela. O código precisa restaurar manualmente foco/cursor, sinal de trabalho estrutural desnecessário. Não há prova de reload do documento do navegador; trata-se de reconstrução do DOM da página interna.
- Correção: montar a estrutura uma vez, manter o campo de busca e a assinatura vivos, atualizar apenas a região de resultados; busca com debounce e paginação no servidor. Aplicar respostas de mutação ao card/linha afetado.
- Critério de aceite: o elemento DOM do campo de busca e a assinatura mantêm identidade entre teclas; a quantidade de linhas renderizadas é limitada.

### 4. P2 — Abrir Tabela de preços provoca comando de arquivamento mesmo sem itens vencidos

- Evidência: `interno/tabela-precos/index.js:29` chama `archiveExpired` se houver qualquer finalizado não arquivado. O teste não distingue registros recentes ou restaurados. A regra real de 90 dias está corretamente no backend, em `supabase/migrations/20261031050550_quote_header_creation.sql:324`–`:326`.
- Impacto: visita comum vira também uma operação de comando e invalidação, mesmo quando o retorno é vazio. **A RPC retorna array; portanto o fallback de reload de `operational-store.js:151` não é acionado por esta ação.**
- Correção: executar arquivamento programado no servidor ou retornar a situação efetiva por leitura, sem comando na abertura da view. Manter o prazo e regras no PostgreSQL.

### 5. P2 — Biblioteca repete carga de metadados e recria grade após excluir/editar

- Evidência: `interno/cadastros/biblioteca-marca/index.js:297`–`:305` espera excluir e depois executa `refresh`; `:195`–`:216` relê assets e categorias, recria opções e chama `draw`. `:319` mantém outro caminho de refresh por sinal do recurso. A grade é substituída em `:112` quando a assinatura muda. A mesma estrutura aparece após edição em `:279`–`:289`.
- Impacto: a ação espera a rede e depois refaz uma grade inteira. O sinal da mutação e o eco Realtime podem provocar leituras extras quando chegam em instantes distintos. Leituras concorrentes podem ser deduplicadas pelo QueryClient; não se afirma que toda exclusão execute sempre duas RPCs.
- Correção: retirar o card localmente com rollback, ou imediatamente após a confirmação da exclusão, atualizar contagens/opções afetadas e reconciliar em segundo plano. Reutilizar miniaturas e nós que não mudaram; deduplicar eco por versão/revisão no caminho compartilhado.
- Em upload múltiplo, `:247`–`:263` salva arquivo por arquivo e executa refresh final; cada salvamento também sinaliza o recurso. Agrupar a reconciliação visual do lote sem eliminar notificações remotas e sem paralelizar uploads sem limite.
- A reprodução do eco atrasado da infraestrutura está em `artifacts/auditoria-sistema-20261102/realtime-echo.json`, produzida pelo agente principal.

### 6. P2 — Renomear um PNG da Biblioteca transfere seu conteúdo completo

- Evidência: o formulário só altera `name/category` (`interno/cadastros/biblioteca-marca/index.js:286`), mas `services.js:55`–`:61` busca o registro completo quando falta `dataURL` e reenvia `{ ...full, ...value }` ao salvar.
- Impacto: uma mudança de texto pode exigir obter e reenviar o PNG original em base64, além de miniatura e metadados. O custo depende do tamanho das imagens; não medido remotamente neste recorte.
- Correção: RPC específica para metadados com ID, nome, categoria e versão esperada. Atualização de binário deve ser uma operação separada.

### 7. P2/P3 — Outros cadastros ainda consultam e desenham coleções inteiras

- Parceiros: `interno/cadastros/parceiros/index.js:11`, `:49`, `:67`; carga integral, todos os cards filtrados e render a cada tecla.
- Categorias/subcategorias: `interno/cadastros/categorias/index.js:18`, `:93`, `:141`; tabela completa e filtros locais.
- Unidades: `interno/cadastros/unidades/index.js:10`, `:47`, `:65`; mesmo padrão, normalmente menor volume, portanto P3 até haver evidência de escala.
- Modelos de cartaz: `interno/cadastros/modelos-cartaz/index.js:8`, `:46`–`:50`; todos os modelos e miniaturas HTML. Há assinatura para pular render idêntico em `:37`–`:45`, mas nenhuma janela/página.
- Cadastro de Açougue: `interno/cadastros/acougue/index.js:8` e `views/list.js:44`/`:54`; lista inteira de modelos. `views/product-picker.js:13`/`:21` também monta os resultados da seleção local. Os arquivos já estão separados em views/hooks/queries/services.
- Editores de Promoções/Tabela: `interno/promocoes/queries.js:12` e `interno/tabela-precos/queries.js:11` carregam todo o catálogo de metadados/modelos para preencher seletores. Não baixam deliberadamente todo o catálogo de fotos, o que é bom, mas ainda escalam com quantidade de produtos.
- Correção: priorizar Parceiros, Biblioteca e seletores conforme volume real; paginação no servidor, seletores com busca remota e atualização por registro. Evitar virtualização/refatorações grandes para Unidades ou Perfis pequenos sem medição que as justifique.

## Cobertura por módulo/submódulo

| Tela | Situação observada | Prioridade neste recorte |
|---|---|---|
| Início | Resumo agregado e aviso em paralelo; atualiza números/aviso sem recriar a página; hook coalesce eventos | Sem P1 local encontrado |
| Cadastros / Produtos — lista | Página remota, busca com debounce de 250 ms, prévias posteriores aos metadados, assinatura evita redraw idêntico | Padrão positivo a generalizar |
| Cadastros / Produtos — detalhe/fotos | Entrada por import dinâmico e leitura por ID; galeria preserva versão e só é regravada se mudou | Sem P1 específico confirmado; custos de mídia dependem dos arquivos |
| Cadastros / Categorias e subcategorias | Leitura integral e tabela local; serviços/queries/realtime separados | P3, elevar conforme volume |
| Cadastros / Unidades | Lista integral; estado incorpora resultado salvo | P3 |
| Cadastros / Parceiros | Todos os cards; busca local; watcher relê lista | P2 |
| Cadastros / Biblioteca de marca | Metadados separados de previews; miniaturas visíveis, concorrência 4; exclusões/edições refazem grade; renomear reenvia original | P2 |
| Cadastros / Categorias da biblioteca | Opera sobre metadados; renomear/remover volta por `onChange → refresh` | P2 compartilhado com Biblioteca |
| Cadastros / Modelos de cartaz | Coleção integral e prévia de cada modelo; exclusão atualiza coleção local; render protegido por assinatura | P2/P3 conforme volume |
| Cadastros / Açougue — modelos e partes | Views/hooks/serviços separados; coleção integral e picker local; edição tem estado próprio | P2/P3 conforme volume |
| Calendário — mês/agenda/eventos | Consulta campanhas completas e mídia sem precisar delas; exclusão remove do store local antes de redraw | P1 na carga; P2 na atualização |
| Promoções — lista | Cards paginados localmente, após carregar tudo | P1 na carga |
| Promoções — editor/produtos/impressão | Nome salvo por tecla; remoção redesenha lista de itens; preço atualiza só a linha; exportações liberam object URLs | P1 na gravação |
| Tabela de preços — rascunhos/enviados/finalizados | Consulta completa, comando na entrada, busca reconstrói módulo, sem página | P1 carga; P2 interação |
| Configurações — índice | Navegação para submódulos, sem carga indiscriminada de todos os recursos | Sem P1 local encontrado |
| Configurações — Empresa | Lê somente empresa; preview local; aviso Realtime preserva formulário | Padrão positivo |
| Configurações — Marca d’água | Lê somente marca d’água; preview local; preserva formulário em evento | Padrão positivo; tamanho de imagem não medido |
| Configurações — Cabeçalho | Empresa + cabeçalho em paralelo; preserva formulário em evento | Padrão positivo |
| Configurações — Usuários | Usuários + perfis; mutação atualiza store, mas refaz tbody e watcher relê | P3, conforme equipe |
| Configurações — Perfis | Apenas perfis; checkbox bloqueia controles enquanto salva; watcher refaz grade | P3 |

## Exclusões e atualizações: o que de fato recarrega

Neste recorte há **quatro fluxos de exclusão de UI** (elemento da Biblioteca, categoria da Biblioteca, modelo de cartaz e evento/anotação do Calendário) e a remoção de item de campanha. Eles não têm o mesmo comportamento:

| Fluxo | Depois da confirmação | Leitura/Rebuild adicional |
|---|---|---|
| Elemento da Biblioteca | `deleteAsset` e `refresh` explícito | Reconsulta metadados, recria grade; watcher também chama refresh |
| Categoria da Biblioteca | Comando de remoção/reclassificação e `onChange` | Refresh da biblioteca/categorias e reconstrução pertinente |
| Modelo de cartaz | `deleteTemplate` remove do array local (`state.js:12`–`:19`) | Galeria refeita; watcher relê modelos; assinatura evita render se idêntico |
| Evento/anotação do Calendário | `services.js:20`–`:23` remove do store; `index.js:208`–`:210` redesenha | Watcher relê eventos em `index.js:293`–`:300` |
| Item de campanha | Resposta salva recebida; `views/products.js:39`–`:43` chama `list()` | Lista de produtos inteira substituída; não é reload do navegador |

Portanto, ainda não há atualização granular uniforme. A frase “toda exclusão recarrega a página” não descreve literalmente todos os caminhos, mas o sintoma de listas piscando/reconstruindo tem base no código. O tratamento compartilhado do eco Realtime é uma frente transversal, e cada view deve deixar de apagar os elementos que não mudaram.

## Melhorias já presentes que devem ser preservadas

- `interno/cadastros/produtos/list.js:37` obtém uma página e `:76` carrega fotos depois; `:114`–`:119` aplica debounce. Resultado de busca antigo é ignorado por geração.
- `interno/cadastros/biblioteca-marca/previews.js:31` limita quatro previews concorrentes; `:49` usa IntersectionObserver. A limpeza descarta fila e observers ao sair/trocar contexto.
- `interno/inicio/queries.js:18` carrega resumo e aviso em paralelo; `hooks/use-home-refresh.js:2` coalesce notificações; `index.js:81` atualiza nós existentes.
- `interno/configuracoes/queries.js:5`–`:9` lê recursos por tela; `store.js:26` deduplica leituras por chave, verifica sessão/empresa e incorpora resposta salva.
- Modelos, Parceiros e outras telas já têm assinatura para não redesenhar resultados idênticos. Assinatura não resolve a consulta extra, mas evita parte do custo de DOM.
- Exportação PDF da Tabela é importada apenas na ação (`interno/tabela-precos/index.js:184`). Não carregar exportadores para visualizar uma lista deve continuar como padrão.

## Sequência recomendada

1. Corrigir gravação por tecla de Promoções e atualização granular pós-mutação/eco compartilhado.
2. Separar summaries paginados de detalhes e mídia, começando por Calendário, Promoções e Tabela de preços.
3. Remover reconstrução integral na busca da Tabela; separar atualização de metadados e binário na Biblioteca.
4. Medir volume real de Parceiros/Modelos/Biblioteca, então paginar os mais pesados e substituir seletores de catálogo integral.
5. Medir navegação fria/quente, uma busca, uma edição e uma exclusão por módulo, com contagem de requests, bytes, tempo de RPC e tempo de DOM. Registrar mediana/p95 e preservar testes de concorrência, empresa e versão.

Não houve alteração de código de aplicação nesta auditoria. O harness foi somente local e não gravou no Supabase. Testes/build globais e medições transversais são responsabilidade do relatório consolidado do agente principal.


## Implementação local posterior à auditoria

As observações acima documentam o estado anterior. Após a autorização para corrigir os gargalos, foram implementadas estas mudanças locais, coordenadas com a infraestrutura e as RPCs dos outros agentes:

| Frente | Mudança aplicada | Evidência principal |
|---|---|---|
| Promoções / edição de nome | Fila por campo com espera de 450 ms, gravação serial e coalescência do valor mais recente; `change` e saída fazem flush sem repetir a mesma gravação; falhas preservam texto | `hooks/use-name-autosave.js`, `tests/campaign-name-autosave.test.mjs`: dez eventos de digitação mais change resultam em uma escrita |
| Promoções / lista | Consulta `sp_resource_page` com 12 resumos; busca remota com debounce; detalhes por ID ao abrir; cards idênticos permanecem montados | `views/list.js`, `queries.js`; a grade recebe `itemCount`, sem carregar `items` e fotos |
| Promoções / remover item | Remove somente a linha confirmada, mantém as demais e seus campos; sincroniza nome pendente antes da remoção | `views/products.js` |
| Tabela de preços / lista | Consulta de 20 resumos por página, busca sem remontar filtros; seleção explícita da página; contagens por etapa fornecidas pelo backend | `views/list.js`, `views/list-markup.js`, `queries.js` |
| Tabela de preços / ações | Versão da página registrada sem substituir detalhes; edição/PDF buscam somente os detalhes necessários; atraso de filtro bloqueia ações sobre página antiga | `rememberPriceTablePage`, `loadPriceTableDetail`, `usePagedList` |
| Tabela de preços / arquivo | Removido comando de arquivamento da abertura; backend passa a executar rotina periódica de 90 dias, preservando restaurados | Depende da migração coordenada com o agente de banco |
| Calendário | Busca resumos de campanhas apenas para as semanas visíveis; navegação mensal consulta novo intervalo e ignora respostas antigas | `campaignPeriod`, `loadCalendarCampaigns`; dois testes incluem ano bissexto, dias adjacentes e limites 0001/9999 |
| Biblioteca / edição | Renomear ou mudar categoria chama RPC de metadados com `_version`, sem baixar nem reenviar PNG original | `services.js`, cinco testes de concorrência/contexto |
| Biblioteca / exclusão e grade | Exclusão otimista com restauração em erro; reconciliação por ID preserva cards e previews não alterados; atualização de um elemento substitui só seu card | `asset-grid.js`, dois testes de identidade de nós/escape |
| Biblioteca / previews | Redraw de metadados observa apenas imagens ainda sem src | `previews.js`, teste de não repetição da leitura |

Validação focada local: **29 testes passaram, nenhum falhou**. Log: `artifacts/auditoria-sistema-20261102/catalog-implementation-tests.log`. Inclui coalescência durante RPC lenta, erro e retry, troca de contexto, preservação da versão visualizada, ausência de transferência do binário para metadados, preservação do DOM, escape de textos e intervalos do calendário. A suíte completa e o build final são executados pelo agente principal para evitar validação duplicada em paralelo.

Todos os arquivos de aplicação alterados neste recorte estão abaixo de 500 linhas. Foi revisada a remoção do hydrate global: Produtos carrega unidades e categorias; Categorias, Unidades, Parceiros, Modelos e Açougue carregam seu próprio catálogo; editores de Promoções/Tabela carregam as dependências necessárias, enquanto as listas novas dispensam esses catálogos.

Limites: nenhuma aplicação remota ou validação autenticada no Supabase foi realizada por este agente. As três novas RPCs, o envelope de páginas e o cron de arquivamento exigem a migração coordenada antes de publicar este frontend. Parceiros/Modelos continuam com coleções completas; não há ganho de latência em produção alegado sem medição remota. As otimizações demonstradas são redução de payload/consultas por contrato e preservação da interface, com testes locais.
