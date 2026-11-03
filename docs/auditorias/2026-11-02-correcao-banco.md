# Correção de desempenho — banco, mídia e contratos

Projeto exclusivo: `enhoierfwuwtzulznjxa`. Aplicação e conferência pela CLI oficial, perfil `supabase`; nenhuma operação pelo navegador ou por MCP de outro projeto. Conferência independente final em **02/11/2026, 05:09–05:14 UTC**.

## Resultado comprovado

| Leitura real | Antes | Depois | Diferença |
|---|---:|---:|---:|
| Lista da única cotação existente | 135.375 bytes | 391 bytes, incluindo paginação e facets | −99,71% |
| Prévia dos quatro produtos legados mais pesados, mesmo critério/mesmos originais preservados | 3.423.880 bytes | 345.452 bytes | −89,91% |
| EXPLAIN isolado dessas quatro prévias | 70,896 ms | 27,673 ms | amostras de execução SQL, sem rede/interface |
| Blocos temporários escritos/lidos pela prévia | 418 | 0 | remove materialização dos originais nessa leitura |

A nova página resumida de cotação mediu **62,367 ms** em uma chamada EXPLAIN isolada. O `sp_list` anterior havia medido 21,76 ms. Portanto, esta evidência **não comprova menor tempo SQL na cotação atual, com apenas um registro**; comprova a remoção do snapshot de imagens da listagem e o limite de registros. Há validação funcional local com várias páginas. Hortifruti, recebimentos do Açougue, Devoluções, Promoções e Tabela de Preços estavam vazios no remoto: cada envelope vazio tem 162 bytes. Não são benchmarks representativos de produção.

Foram geradas e gravadas **137 miniaturas reais**: 50 fotos legadas e 87 fotos de Storage. Nenhum conflito de versão. Os arquivos originais lidos somam 134.171.135 bytes binários; os derivados PNG/base64 somam 12.942.546 bytes, no máximo 256 px por lado. Esses totais usam representações distintas e não substituem a comparação de payload da RPC acima.

A conferência independente confirmou **186 documentos de produto sem nenhuma alteração de conteúdo**, 137 miniaturas com hash da fonte correto e **12 documentos operacionais/artes/PNGs com hashes e versões idênticos**. Só as versões dos 137 produtos receberam o incremento esperado pela nova miniatura. Os arquivos originais no Storage foram somente lidos. Não houve conversão das imagens incorporadas em documentos históricos nem substituição de fotografias.

## Contratos implementados

### Listagens dos seis módulos

`sp_resource_page(p_company_id,p_resource,p_page,p_per_page,p_query,p_status,p_start,p_end,p_category,p_archived)` atende `quotes`, `hortifruti_receipts`, `butcher_receipts`, `supplier_returns`, `campaigns` e `price_tables`.

- Retorna `{items,page,pages,perPage,total,allTotal,from,to,counts,facets}`; máximo de 50 itens. `facets` contém categorias das cotações e contagens por status.
- Projeções `list_summary` são geradas e armazenadas pelo PostgreSQL. A leitura de cards não descompacta os documentos/imagens de todas as linhas.
- Totais comerciais de Hortifruti e Devoluções vêm de `computed`, preparado pelas RPCs de negócio. Contagens são calculadas no banco.
- Busca normaliza acentos e cobre títulos, produto, código, fornecedor/parceiro, modelo e observações. Filtros de período, situação e categoria são executados no servidor; em Hortifruti, `pending` inclui todo registro não finalizado.
- `p_archived` aceita `active`, `archived` ou `all` para Tabela de Preços. Contagens usam esse universo, independentemente da busca/situação corrente.
- Índices por empresa/ordem de criação e empresa/situação/data acompanham as projeções. Detalhe completo continua em `sp_get`; não foi removido nenhum histórico.

`sp_campaign_calendar(p_company_id,p_start,p_end)` retorna apenas identificação, nome, datas e observações das campanhas que intersectam o período, limitado a 366 dias por consulta. Não carrega snapshots dos produtos.

### Biblioteca

`sp_brand_asset_metadata_update(p_company_id,p_id,p_name,p_category,p_expected_version)` altera somente nome/categoria e retorna metadados. O frontend não precisa ler/enviar o PNG original para renomear. Permissões, categoria existente, versão, auditoria e sinal de Realtime são conferidos. Os pixels originais e a prévia permanecem iguais.

### Produtos

`products.preview_data_url` e `preview_source_hash` guardam o derivado separado do documento canônico. O trigger valida PNG, tamanho/dimensões e remove a prévia se a foto principal mudar. `sp_product_thumbnail_save` exige permissão de escrita e `_version`, incrementa a revisão, audita e gera o sinal normal.

`sp_product_previews` mantém a assinatura existente e entrega a miniatura quando disponível. O detalhe e `sp_product_media` continuam entregando os originais. Se uma nova foto ainda não tiver derivado, o fallback explícito continua no original; falhas de backend não são convertidas em conteúdo falso.

Uploads normais passam por `saveProductGallery`: preparam a miniatura antes de gravar a galeria, salvam o original e enviam o derivado com a versão confirmada. A resposta combina a versão mais recente. Uma falha exclusiva no derivado não desfaz nem falsifica a confirmação da galeria, e permite tentativa posterior de manutenção. Derivados detalhados reduzem de 256 para 192 px se ultrapassarem o limite de representação.

`scripts/backfill-product-thumbnails.mjs --apply` executou a manutenção rastreável por lotes de dez. Sem `--apply`, somente prepara. A identidade e o vínculo ativo do proprietário autorizam a RPC; cada escrita usa a versão lida e confere hash do JSON original e do derivado. Conflitos de versão são ignorados, nunca sobrescritos. Fotografias e credenciais não entram nos relatórios.

### Realtime e retenção

`resource_changes.mutation_id` recebe somente um UUID validado do header `x-sp-mutation-id`. O trigger `sp_private.track_resource_change` preserva a revisão por empresa/recurso em inclusão, alteração e exclusão. Um sinal sem identificador grava `null`, evitando herdar um ID anterior. O valor não concede autorização; o frontend pode correlacionar o eco exato de uma gravação já confirmada, preservando eventos de outras sessões.

O gateway aceitou o header no preflight OPTIONS HTTP 200. `memberships` e `resource_changes` continuam sendo as únicas tabelas na publicação `supabase_realtime`.

O arquivamento existente de Tabela de Preços após 90 dias agora tem job `sp-archive-expired-price-tables`, a cada 15 minutos. Processa até 200 finalizados vencidos, preserva registros restaurados, usa `SKIP LOCKED`, incrementa versão, audita e sinaliza. Não depende da abertura da página nem devolve documentos completos ao frontend. `sp-expire-flyer-drafts`, com retenção de 15 dias desde a última gravação, permanece ativo e inalterado.

## Aplicação e segurança

Quatro migrações aplicadas após dry-run em diretório temporário com as 20 versões remotas existentes e somente estas pendências:

1. `20261102040347_resource_summary_pages.sql`
2. `20261102040438_metadata_and_realtime_mutation.sql`
3. `20261102040852_product_thumbnails.sql`
4. `20261102043841_price_table_archive_schedule.sql`

Outro trabalho do usuário adicionou produtos e migrações durante esta sessão; essas mudanças foram preservadas. Não foram atribuídas à correção desta auditoria. `--include-all` foi usado somente no staging isolado porque versões mais recentes de outro trabalho já estavam aplicadas.

As quatro novas RPCs públicas são invocadoras, com `search_path` vazio: `authenticated` pode executar, `anon` não. Implementações privadas exigem empresa/vínculo/perfil e bloqueiam gravação concorrente. As nove tabelas verificadas mantêm RLS e negação de escrita direta aos clientes. O job administrativo não pode ser executado por `authenticated` ou `anon`. Nenhum timeout do banco foi aumentado.

## Validação e limites

`npm run test:db` passou novamente após as últimas alterações das quatro migrações. `system-performance.integration.mjs` cobre páginas e filtros, limites, totais/facets, intersecção do calendário, empresa/anon/inativo, rename sem alteração de imagem, versão divergente, correlação de exclusão, derivado inválido/troca de fonte, preservação do original e arquivamento de 90 dias/restauração/idempotência/permissões. Quatro testes adicionais do cliente de miniaturas passaram.

Listas usam offset com ordenação estável; contagens e busca textual ainda dependem de varrer projeções pequenas. Um volume muito maior pode justificar cursor/índice textual, a ser medido com dados representativos. O calendário é limitado por período, mas não pelo número de campanhas nesse intervalo. Documentos individuais grandes mantêm sua mídia original por fidelidade histórica. A redução comprovada de payload e a amostra SQL não equivalem a uma medição de latência em cada máquina/rede.

Evidências em `artifacts/system-performance-20261102/`:

- `migration-dry-run.txt`, `migration-apply.txt`: escopo e aplicação remota; aviso de Docker ocorreu apenas ao tentar criar cache local após o push concluído.
- `remote-before.json`, `remote-after.json`, `preservation-and-security.json`: hashes, versões, RLS, grants, publicação, colunas e jobs.
- `product-thumbnail-backfill.json`: resultado por produto, tamanho, origem e hashes; sem pixels.
- `rpc-payload-after.json`, `plan-previews-after.json`, `plan-quotes-after.json`: medições reais somente leitura.
- `cors-verification.json`: resposta sanitizada do preflight.
- `database-tests-final.log`, `product-thumbnail-client-tests.log`: validação local final.

Consulta de conferência reproduzível: `supabase/tests/system-performance.remote-verification.sql`.
