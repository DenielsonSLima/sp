# Auditoria transversal de carregamento e cache

Data: 02/11/2026, America/Maceio. Revisão do código atual e medições locais; sem alteração da aplicação ou do banco nesta rodada. O build regenerou `dist/` para validar o estado atual.

## Escopo e premissas

- Aplicação JavaScript modular autenticada, usada pelo usuário em Safari desktop. Qualidade da conexão não medida; nenhum número de latência de rede foi pressuposto.
- Preservar arquitetura atual, RPCs, autorização por empresa, concorrência por `_version` e limite de 500 linhas por arquivo da aplicação.
- Skills consultadas: senior-frontend, senior-fullstack, senior-backend, Supabase, Supabase Postgres Best Practices e TanStack Query Best Practices. As especialidades já estavam disponíveis; não foi necessário trocar stack nem instalar dependências de produção.
- Metas propostas para uma rodada de correção: LCP p75 <= 2.500 ms, INP p75 <= 200 ms, CLS <= 0,1; orçamento de JavaScript de até 200 KB gzip inicial e 80 KB gzip adicional por rota. São critérios futuros, não resultados desta auditoria. Acessibilidade: objetivo AA, Lighthouse >= 90; desempenho >= 90 em perfil controlado, mantendo medição real separada. Responsável por validação técnica: manutenção do projeto; aceite de experiência: proprietário do sistema.
- Revisão feita por CLI e leitura de arquivos. Não foram usadas sessões autenticadas do navegador nem alterados dados reais para simular interações.

## 1. P1 — A modularização ainda não tem um build adequado para entrega

**Evidência:** `build.mjs:7` copia `shared/`, `interno/` e `login/` diretamente para `dist/`. Apenas Supabase e TanStack são empacotados e minificados nas linhas seguintes. `index.html:1` não contém preload do grafo de módulos.

Medição do grafo de imports estáticos com o metafile do esbuild, fotografia de 02/11/2026 às 03:28:34 UTC (00:28:34 local). Outras sessões alteraram arquivos depois desta coleta; os valores abaixo pertencem ao artefato registrado, não a uma nova medição do estado final:

| Entrada | Arquivos JS próprios adicionais | Bytes de código-fonte adicionais |
| --- | ---: | ---: |
| Bootstrap/login/shell | 25 | 91.523 |
| Início | 25 | 45.947 |
| Cotação | 49 | 165.259 |
| Hortifruti | 40 | 113.069 |
| Açougue | 15 | 26.712 |
| Devoluções | 24 | 30.196 |
| Calendário | 28 | 73.680 |
| Promoções | 21 | 63.751 |
| Tabela de preços | 16 | 53.049 |
| Encartes | 54 | 208.400 |

O bootstrap ainda inclui dois vendors, somando 267.511 bytes. Há 10 folhas CSS iniciais (43.105 bytes), contando os `@import` do shell.

Esses números representam imports estáticos sem cache; não são captura de rede. Imports dinâmicos internos, fotos, fontes e RPCs somam trabalho posterior. Um arquivo é reutilizado entre rotas; os totais de todas as rotas não devem ser somados como download inicial. O código possui ciclos, e os níveis registrados no JSON são distâncias mínimas no grafo, não uma estimativa de tempo de abertura.

**Impacto:** muitos pedidos e descoberta encadeada, apesar do tamanho relativamente pequeno do código. Separar arquivos de autoria foi correto, mas entregar todos esses arquivos diretamente mantém custo de abertura e parsing. Editor/PDF também aparecem em imports estáticos de algumas listas.

**Correção proposta:** empacotar a aplicação com esbuild e divisão por rota; preservar fonte modular e <= 500 linhas. Deixar editores e exportadores pesados sob import dinâmico, usar nomes com hash e preload dos chunks críticos. Medir a mesma rota antes/depois, com cache frio e quente.

Evidência detalhada: `artifacts/auditoria-sistema-20261102/frontend-graph.json`.

## 2. P1 — Alteração local e eco do realtime repetem leituras

**Evidência:** `shared/data/queries/records.js:99` invalida o recurso após a mutação. `shared/data/api.js:129` notifica assinantes. Depois, `shared/data/realtime.js:49` agenda a mesma invalidação ao receber o evento próprio, com debounce de 80 ms, sem identidade/versionamento de mutação para reconhecê-lo.

Reprodução local usando a API real e TanStack Query Core, com transporte simulado:

1. Uma leitura inicial de parceiros.
2. Um `sp_save`, seguido da leitura de atualização.
3. O evento próprio chega após a primeira atualização terminar.
4. Ocorre outra chamada de `sp_list`.

Resultado: **uma gravação e duas leituras de atualização**, além da leitura inicial. A deduplicação em andamento funciona quando os pedidos coincidem; ela não evita o segundo pedido que chega depois.

**Impacto:** amplifica respostas grandes e reconstruções da interface em todos os recursos que atualizam a lista ao receber notificação. A quantidade observada em produção depende da ordem/latência dos eventos; não se afirma que toda gravação sempre duplica.

**Correção proposta:** integrar a confirmação da mutação ao cache por registro e usar versão/identificador de evento para reconhecer o eco já aplicado, preservando alterações de outros usuários. Consolidar atualização explícita da tela e assinatura realtime. Não desativar o realtime ou ignorar eventos por uma janela de tempo arbitrária.

Evidência: `artifacts/auditoria-sistema-20261102/realtime-echo.json`.

## 3. P1 — Invalidação elimina mídia válida de todo o recurso

**Evidência:** `shared/data/api.js:122–123` remove todo `snapshot_media` do recurso operacional. Snapshots incluem referências de assets. O descarte ocorre mesmo ao mudar somente um preço/nome. Na coleta inicial, produtos também sofriam invalidação de mídia ampla; na releitura final, outra sessão já havia ajustado esse caminho para preservar fotos/prévias por ID e versão. Essa correção concorrente não foi feita por esta auditoria e não elimina o problema restante de snapshots.

**Impacto:** leituras de metadados e assinaturas de URLs de registros não alterados se repetem; eventual novo download das imagens depende da renderização e do cache do navegador. Em listas operacionais, isso se combina com a preparação das fotos de todos os documentos antes da apresentação.

**Correção proposta:** conservar mídia por versão/caminho e validade; invalidar apenas entradas efetivamente afetadas. Mudança de sessão/empresa continua exigindo limpeza integral. Detalhes da reprodução e impacto em Cotação/Horti/Devoluções constam no relatório de operações.

## 4. P2 — Cinco rotas esperam catálogos antes de iniciar o próprio módulo

**Evidência:** `interno/shell.js:177` espera `hydrateCatalogs()` antes de `activeModule.load()`. Aplica-se a Hortifruti, Açougue, Devoluções, Promoções e Tabela de preços. `interno/cadastros/remote.js:23–29` carrega unidades e parceiros em paralelo entre si, mas toda essa etapa antecede o import da rota. Alguns domínios também chamam essas cargas no próprio bootstrap.

**Impacto:** catálogo lento bloqueia a abertura do módulo e soma dependências ao caminho crítico. Query cache pode deduplicar chamadas repetidas; não torna independentes as etapas hoje sequenciais.

**Correção proposta:** retirar o carregamento genérico do shell; domínio deve carregar apenas dependências necessárias, em paralelo com seus dados/import, e permitir apresentação progressiva da lista.

## 5. P2 — Navegação reconstrói o shell inteiro e o transporte não recebe cancelamento

**Evidência:** `shared/app.js` chama `render()` em todo `hashchange`; `interno/shell.js:50` substitui toda a workspace antes de abrir a rota, inclusive navegação e cabeçalho. A maioria dos `queryFn` em `shared/data/queries/records.js` e `products.js` ignora `signal`; `shared/data/api.js:41` não transmite um sinal a `.rpc().abortSignal(...)`.

**Impacto:** perda de continuidade visual em navegação e requisições de leitura antigas podem continuar consumindo conexão até concluir/timeout. Os controles de geração protegem contra aplicação de resultado em sessão errada, mas não cancelam o transporte. Não foi atribuído um tempo em milissegundos ao custo de DOM sem perfil do navegador.

**Correção proposta:** manter o shell estável, substituir só o outlet e atualizar a navegação. Propagar AbortSignal para leituras e cancelar somente pedidos sem consumidores; preservar deduplicação de pedidos compartilhados. Não cancelar gravações já iniciadas como se isso revertesse a transação.

## 6. P2 — O servidor de desenvolvimento limita a avaliação da experiência

**Evidência HTTP real:** `curl -I` para `http://127.0.0.1:4173/shared/app.js`, com `Accept-Encoding: gzip, br`, retornou `HTTP/1.0 200 OK`, `Server: SimpleHTTP/0.6 Python/3.9.6`, sem `Content-Encoding` ou `Cache-Control`; `Last-Modified` está presente. `npm run dev` executa build + esse servidor, sem HMR.

**Impacto:** o cenário local usado nos screenshots não representa uma entrega com compressão e cache de assets versionados. Não significa que não exista qualquer cache no navegador (Last-Modified permite revalidação), nem comprova as configurações do ambiente publicado.

**Correção proposta:** servidor de desenvolvimento com atualização automática; na entrega, compressão e cache imutável somente para arquivos com hash. Comparar desenvolvimento e produção com a mesma massa de dados.

## O que já está correto

- Rotas principais usam import dinâmico; não há import estático de todas as telas no bootstrap.
- Um único QueryClient e um canal realtime por empresa; chaves segregadas por empresa e limpeza na troca de identidade.
- Consultas simultâneas iguais são deduplicadas; listeners da view têm descarte e fila de refresh.
- Sem recarregamento global por `location.reload()` identificado no código da aplicação. As telas de carregamento observadas são reconstruções de DOM/refetch, não necessariamente recarga do documento HTML.
- Produtos tem paginação de 20/25 registros e prévias limitadas; biblioteca e Encartes têm projeções compactas específicas. Essas melhorias não foram generalizadas a todas as listas operacionais.
- Validação atual: 505 testes aprovados, 13 opcionais ignorados, 0 falhas; suite de banco e build aprovados. 307 arquivos da aplicação dentro de 500 linhas; 239 módulos no grafo de runtime. Isso comprova contratos executados pelos testes, não desempenho ponta a ponta.

## Limitações

Não foi medido LCP/INP/CLS/p95 de todas as telas autenticadas nem teste de carga multiusuário. Não existe instrumentação de performance com `PerformanceObserver`/`performance.mark` no runtime auditado. A fotografia do repositório pode mudar: outras alterações do usuário/sessões já estavam presentes e foram preservadas. Nenhuma migração ou correção de desempenho foi aplicada durante esta auditoria.
