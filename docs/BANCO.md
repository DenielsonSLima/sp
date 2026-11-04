# Banco de dados — Supermercado do Povo

Projeto autorizado: `enhoierfwuwtzulznjxa`. O cliente usa a URL pública e uma chave publishable; nenhuma chave administrativa ou senha PostgreSQL pertence ao navegador.

## Organização

O banco separa os dados por `company_id`, com vínculo de usuário em `memberships`. O proprietário e administradores gerenciam os acessos; os demais usuários dependem dos módulos do perfil vinculado. Um cadastro no Supabase Auth, sozinho, não concede acesso a nenhuma empresa.

| Grupo | Tabelas |
| --- | --- |
| Identidade | `companies`, `memberships`, `profiles` |
| Cadastros | `units`, `partners`, `products`, `product_categories`, `butcher_models` |
| Comunicação visual | `brand_assets`, `brand_categories`, `poster_templates`, `flyer_templates`, `flyer_assets`, `flyers` |
| Configurações | `company_settings`, `watermarks`, `headers` |
| Compras e operação | `quotes`, `hortifruti_receipts`, `butcher_receipts`, `supplier_returns` |
| Ofertas | `campaigns`, `price_tables`, `calendar_events`, `home_notices` |
| Auditoria e sincronização | `audit_log`, `resource_changes` |

Os documentos de cada domínio ficam na sua própria tabela. `data` mantém os campos e snapshots usados pelo módulo, em JSONB, com validação SQL por recurso. As colunas de identidade, empresa, versão e timestamps ficam fora do documento. Há índices por empresa/data, unicidade de siglas, códigos de produto, nomes de perfis/categorias e número de devolução por fornecedor. A API valida referências dos catálogos dentro da mesma empresa e preserva documentos vinculados ao excluir cadastros.

A identificação `user_access` da API representa `memberships` e as contas existentes no Auth; não é uma tabela de senhas ou uma segunda autenticação.

## Contrato RPC

Aplicado e conferido no projeto autorizado em 03/11/2026: agrupamento de Tabela de Preços por promoção, com cabeçalho, inclusão/remoção de produtos em lote e exclusão de rascunhos versionada. Migração `20261104012757_price_table_promotions.sql`. Teste autenticado com rollback, RLS, grants, Realtime e preservação do rascunho real e das versões/metadados dos 207 produtos confirmados. Contratos e evidências: [TABELA-PRECOS.md](TABELA-PRECOS.md).

| Função | Parâmetros | Retorno |
| --- | --- | --- |
| `sp_context` | nenhum | Usuário e empresas autorizadas, com perfil/módulos. |
| `sp_list` | `p_company_id`, `p_resource` | Lista de registros canônicos. |
| `sp_get` | empresa, recurso, `p_id` | Registro ou `null`. |
| `sp_save` | empresa, recurso, `p_record`, `p_expected_version` | Registro salvo e `_version`. |
| `sp_delete` | empresa, recurso, ID, versão esperada | Confirmação da exclusão permitida. |
| `sp_command` | empresa, recurso, `p_action`, `p_id`, `p_payload`, versão esperada | Documento canônico ou lista de documentos em operações em lote. |
| `sp_calculate` | empresa, `p_kind`, `p_input` | Prévia calculada pelo PostgreSQL. |

O frontend envia valores digitados, identificadores e ações. Totais monetários, classificação das propostas, custos por pesagem, acertos e rateios do açougue são calculados em SQL. Os valores são armazenados como centavos, micros de unidade/peso ou gramas conforme o domínio. As divisões usam `numeric` e arredondamento no banco.

Cálculos disponíveis: `hortifruti_line`, `butcher`, `supplier_return_line`, `supplier_return_preview`, `quote`, `home_summary`, `poster_template_draft`. A criação de um modelo de cartaz pode solicitar seu rascunho visual ao banco, inclusive quando a empresa não possui modelos salvos; isso não grava um cadastro automaticamente. O resumo diário considera o fuso `America/Maceio`.

Nos recursos operacionais, `sp_save` recusa gravações livres. `sp_command` aplica as transições permitidas: cotação/finalização por fornecedor, compras/pesagem/entrada, precificação, devoluções/acertos, campanhas e envio/finalização da tabela de preços. Um cliente não pode gravar um total ou histórico de acertos arbitrário.

`_version` é obrigatório para alterar ou excluir um registro existente. A versão é comparada dentro da transação e sob bloqueio. Os lotes `send` e `finalize` da tabela de preços recebem `expectedVersions: {id: version}` e só avançam se todos os itens ainda corresponderem à versão revisada.

## Segurança e Realtime

Todas as tabelas têm RLS. `anon` não recebe leitura ou execução das RPCs. `authenticated` recebe SELECT filtrado por empresa/módulo; INSERT, UPDATE e DELETE diretos são revogados. As funções públicas são invocadoras e delegam a implementações privilegiadas em `sp_private`, esquema não exposto no Data API. Cada entrada privilegiada verifica `auth.uid()` e autorização da empresa. O nome do recurso passa por uma lista fixa antes de qualquer SQL dinâmico.

A autorização consulta os vínculos e perfis no banco; não confia em `user_metadata` editável nem em uma empresa enviada pelo cliente. Proprietários não podem ser rebaixados/desativados pela operação comum, e usuários não podem desativar o próprio vínculo.

A publicação `supabase_realtime` contém `resource_changes` e `memberships`. Triggers dos módulos incrementam um sinal com empresa, recurso e revisão em `resource_changes` a cada criação, alteração ou exclusão. O frontend recebe INSERT/UPDATE desse sinal filtrado pela empresa e invalida as queries afetadas; documentos, imagens e auditoria não são enviados no evento. Isso também cobre exclusões sem depender do filtro de eventos DELETE do Postgres Changes. Os dados finais são relidos por RPC e passam novamente pela autorização.

A sessão observa seu próprio vínculo em `memberships` por `user_id`, inclusive quando o acesso fica inativo. Alterações de perfil incrementam os vínculos associados para disparar a atualização do contexto/permissões. A política de leitura do próprio vínculo permanece válida após a desativação, permitindo ao cliente receber a revogação e limpar o cache.

Os PNGs da biblioteca são validados por assinatura, IHDR e dimensões reais. As novas fotografias dos produtos ficam no bucket privado `product-photos`; `products.data.photoAssets` guarda referências, posições, dimensões, tamanho, ângulo e origem. A migration `20261031032723_product_photo_storage.sql` inclui RLS no Storage e `sp_product_gallery`, com versão esperada, limite combinado de cinco fotos e conferência do objeto real. Objetos referenciados por produtos ou documentos não podem ser sobrescritos/excluídos pela aplicação. URLs assinadas existem apenas em memória, com validade de 15 minutos e renovação antecipada. Os 50 produtos migrados anteriormente continuam compatíveis com suas fotos legadas em JSONB. Encartes copiam os pixels para um snapshot permanente; cotação, hortifruti e demais documentos conservam a referência estável assinada na leitura. Nenhuma URL temporária é persistida.

## Primeiro acesso administrativo

1. Crie a conta do responsável no Supabase Auth, usando o fluxo de cadastro/convite apropriado.
2. Como administrador do banco, execute a operação abaixo com o e-mail real da conta existente:

```sql
select sp_private.bootstrap_company(
  'denielsonlima201099@gmail.com',
  'Supermercado do Povo'
);
```

A função é administrativa: `anon` e `authenticated` não têm EXECUTE. Ela cria a empresa, o vínculo de proprietário, perfis, seis unidades, categorias da biblioteca, configurações e três modelos de cartaz. A repetição com o mesmo proprietário e nome retorna a empresa existente. Não cria usuários Auth, senhas, produtos fictícios nem dados operacionais demonstrativos.

Para liberar outro acesso, a pessoa deve existir no Auth. Um administrador usa a tela de usuários para vincular o e-mail a um perfil. O backend resolve o usuário por e-mail e não permite que a tela crie contas Auth ou conceda o papel de proprietário.

## Migrações e testes

`supabase/schema.sql` é a fonte revisada da fundação; a migration correspondente deve conter exatamente esse conteúdo. O teste integra PostgreSQL em memória (PGlite) com um esquema Auth mínimo de teste e dados exclusivamente fictícios:

```sh
node supabase/tests/database.integration.mjs
node supabase/tests/catalog.integration.mjs
node scripts/migrate-catalog-build.mjs --check
```

Ele verifica compilação SQL, isolamento entre empresas, bloqueio anônimo, escrita somente por RPC, concorrência, referências, cotação até a finalização, acertos de devolução, pesagem por caixas, preço BRL bruto, rateio preservando gramas, imagens PNG, reclassificação atômica, lotes de impressão e bootstrap administrativo.

PGlite não reproduz a infraestrutura Auth/Realtime/Storage do serviço hospedado. Depois de aplicar a migration, a validação remota deve confirmar tabelas/RLS, funções e grants, publicação Realtime, autenticação real e as RPCs na sessão do responsável. Um build ou teste local aprovado não comprova a aplicação da migration em produção.

## Migração do catálogo original

A migration incremental `20261031030545_migrate_existing_catalog.sql` acrescenta `product_categories`, `flyer_templates` e `flyer_assets`, mantendo as mesmas RPCs, RLS por empresa e sinais Realtime. O projeto passa a ter 27 tabelas públicas. Categorias de produto são cadastros do banco; renomear uma categoria atualiza os produtos vinculados e suas versões na mesma transação, e excluir uma categoria em uso é bloqueado.

O snapshot revisável `supabase/seeds/original-catalog-v1.json` reúne os registros anteriormente definidos no frontend: 50 produtos (4 Hortifruti, 19 Mercearia, 4 Bebidas, 12 Laticínios e 11 Açougue), sete categorias de produto, três modelos de cartaz, onze categorias da biblioteca, oito modelos de encarte e seis recursos gráficos. Ele não faz parte do site gerado nem é importado em execução. As fotografias originais permanecem em `assets/`; o snapshot registra caminho, tamanho e SHA-256.

O gerador `scripts/migrate-catalog-build.mjs` verifica cada fotografia e incorpora os dados binários à migration como data URI. As 50 imagens originais totalizam 11.270.454 bytes; a migration completa tem aproximadamente 15,15 MB. As fotos dos produtos são transferidas para JSONB no banco; os seis recursos gráficos dos encartes conservam caminhos estáticos locais confiáveis. Nenhuma foto depende de uma URL `file://` do computador.

A importação seleciona exclusivamente a empresa existente do proprietário autorizado pelo e-mail e nome, recusando zero ou múltiplos resultados. Produtos com ID já existente, ou nome equivalente na mesma categoria, são preservados. As cores dos três modelos de cartaz originais só são restauradas quando o registro ainda está na versão 1 e corresponde exatamente aos valores conhecidos do bootstrap; modelos modificados pelo usuário permanecem intactos. Não são importados fornecedores, usuários, compras, cotações ou outros exemplos do protótipo.

`audit_log.details` registra a origem, o hash do snapshot, a quantidade de produtos inseridos/preservados e de modelos/recursos adicionados. O marcador de conclusão torna a etapa de importação de dados idempotente: repeti-la depois de concluída não recria itens removidos nem desfaz alterações posteriores. A migration estrutural continua sendo aplicada uma única vez pelo histórico de migrations.

O teste `catalog.integration.mjs` executa a fundação e a migration incremental em PostgreSQL/PGlite. Confere o catálogo completo, as imagens, a preservação de edição concorrente, a restauração restrita do bootstrap, categorias e vínculos, RLS, sinais e a repetição da etapa de importação sem alterações.

## Catálogo de outubro de 2026 e Storage

Foram cadastrados 33 produtos pesquisados, com 99 PNGs novos e transparentes (três vistas por item), pela conta Auth autorizada e pelas RPCs. O catálogo passou de 50 para 83 produtos. O importador `scripts/import-product-storage.mjs` usa somente a chave pública existente e credenciais Auth recebidas por entrada oculta; não consulta chaves administrativas. A criação do bucket privado foi feita no painel autenticado, com limite de 8 MB por imagem. Pesquisa, manifesto, prompts e evidência estão descritos em `docs/CATALOGO-IMAGENS.md`.

## Categorias, subcategorias e paginação de produtos

A migration `20261031043008_product_server_pagination.sql` mantém `product_categories` com dois níveis: categorias principais sem `parentId` e subcategorias com `parentId` da categoria principal da mesma empresa. O nome é único por empresa/pai. Produtos guardam `subcategoryId` e o rótulo derivado `subcategory`; a RPC valida o vínculo com a categoria selecionada. Renomeações propagam os rótulos e versões dos produtos atomicamente; exclusões com dependências são bloqueadas. Gravação, galeria e exclusão seguem a mesma ordem de locks da taxonomia. RLS, grants, `_version` e sinais `resource_changes` continuam obrigatórios.

A classificação inicial é administrativa, restrita à empresa do proprietário autorizado, preserva classificações existentes e gera auditoria. Foram criadas 25 subcategorias com base nos nomes reais do catálogo, vinculando os 83 produtos. As categorias principais sem produtos continuam disponíveis, sem inventar itens/subcategorias.

`sp_product_page` recebe busca, categoria, subcategoria, página e tamanho limitado a 50. O banco filtra, conta, limita a página e calcula seus intervalos. A tela usa 20 registros em cards ou 25 em tabela. A busca trata acentos e texto literal, incluindo nome/código. A resposta contém somente metadados, sem imagens ou galerias; a primeira página remota mediu 6.049 bytes para 20 dos 83 registros.

`sp_product_previews` entrega somente a foto principal dos IDs solicitados, com autorização por empresa. O cliente solicita os IDs da página em lotes de quatro, no máximo dois simultâneos, após apresentar os metadados. Navegação interrompe lotes seguintes obsoletos; cache TanStack usa empresa, filtros, página e versão. Galerias completas são carregadas pelo `sp_get` de um único produto ao abrir seus detalhes. A consulta completa de catálogo continua disponível para módulos que ainda precisam dela; esta mudança limita a tela de Produtos e não afirma paginar os outros fluxos.

Categorias usa uma tabela com busca e filtros pelos dois níveis. Seu pequeno conjunto de 32 registros é carregado de uma vez, sem produtos/fotos. Produtos oferece filtro por subcategoria, coluna na tabela e edição do vínculo. Evidência remota: `supabase/tests/product-pagination.remote-verification.sql` e `artifacts/catalog-20261031/pagination-remote-verification.json`.

## Criação de cotação por cabeçalho

A migration `20261031050550_quote_header_creation.sql` permite criar uma cotação aberta com `title` (descrição, até 200 caracteres), `date` válida e `notes` (observação opcional, até 4.000 caracteres). O comando `create` fornece listas vazias de produtos e fornecedores quando ausentes; não aceita reutilizar um ID existente. Produtos e fornecedores podem ser vinculados depois, pelos comandos já existentes. Totais e validação permanecem nas RPCs.

Uma cotação sem produtos ou fornecedores não pode ser finalizada, inclusive pela API. Uma proposta de fornecedor sem itens fica incompleta e não entra na classificação como valor zero. A criação/edição preserva RLS, auditoria, versão otimista e sinal Realtime. A observação é mantida nos comandos seguintes.

A interface abre um modal nativo em tela cheia, com somente os três campos. Depois de salvar, abre a cotação em Resumo com a lista de itens e as abas Produtos, Fornecedores e Comparativo final. O detalhe pinta antes de consultar o catálogo; o seletor lê apenas metadados e mostra até 20 opções por busca, com fotos principais em lotes limitados. As fotos do detalhe pertencem somente aos produtos da cotação. Nenhuma galeria inteira é baixada para abrir a criação ou um documento vazio.

## Parceiros — dados empresariais e consulta CNPJ

A migration `20261031054608_partner_company_details.sql` foi aplicada ao projeto autorizado. O JSONB de parceiros conserva nome, razão social, nome fantasia, CNPJ, contato e endereço em campos separados. A validação PostgreSQL aceita CNPJ numérico e alfanumérico com dígitos verificadores, impede duplicidade na empresa e valida UF/CEP. Atualizações parciais preservam os outros campos. Permanecem autorização por empresa, `_version`, auditoria e sinal Realtime.

`sp_partner_cnpj` autoriza e normaliza a consulta. `shared/data/partner-lookup.js` consulta BrasilAPI e, em caso de indisponibilidade, CNPJ.ws; as chamadas públicas não recebem tokens da sessão. TanStack mantém o resultado em cache por empresa/CNPJ. O modal permite revisar e editar os dados antes da gravação e preserva digitação feita durante uma consulta. Falhas permitem preenchimento manual, sem inventar dados. Fontes: https://github.com/BrasilAPI/BrasilAPI e https://docs.cnpj.ws/referencia-de-api/api-publica/consultando-cnpj.


## Biblioteca: metadados e PNG individual

A migration `20261031070000_brand_asset_metadata.sql` adiciona uma projeção gerada `brand_assets.metadata`, sem `dataURL`, e a RPC `sp_brand_asset_metadata`. A função exige o mesmo acesso de leitura à Biblioteca e filtra a empresa autorizada. PNGs completos continuam disponíveis somente pelo `sp_get` de um registro, com RLS e `_version` preservados. As pastas não carregam binários; as prévias visíveis solicitam no máximo dois PNGs simultaneamente. Inserção no editor, download e edição materializam um PNG individual. Renomeação/movimentação de categoria e exclusão conservam os sinais existentes de `resource_changes`.

A necessidade foi observada após inserir os sete PNGs da marca/Natal: a listagem agregada de cerca de 16 MB atingiu `statement_timeout`, enquanto os 18 produtos do segundo lote já estavam gravados e suas três fotos conferidas por hash. A validação local está em `supabase/tests/brand-media.integration.mjs`; a aplicação e a evidência remota devem ser registradas separadamente.


Status final em 31/10/2026: após autorização explícita do usuário (“AUTORIZADO”), a migration `20261031070000_brand_asset_metadata.sql` foi aplicada no SQL Editor autenticado do projeto `enhoierfwuwtzulznjxa`, em transação com registro no histórico e reload do PostgREST. A conferência remota confirmou RPC/coluna gerada, histórico com MD5 `c339964954f7f191722646da2ab41fac` idêntico ao arquivo local, RLS ativa, EXECUTE negado a anon e concedido a authenticated, `resource_changes` publicado e 120 produtos preservados. Os sete PNGs somam 15.586.274 bytes; os metadados somam somente 846 bytes.

A revisão automática havia bloqueado a primeira tentativa por falta de autorização explícita do método; a execução posterior ocorreu somente após a resposta do usuário e foi aceita. Evidência remota: `artifacts/galeria-natal-20261031/brand-metadata-remote-verification.json`. No Safari, pastas Logos/Natal, prévia transparente, inserção de logo/selo no editor, salvamento e exportação PNG 1080 × 1920 foram conferidos. O frontend continua preparado localmente, sem publicação do site original.

## Encartes: biblioteca leve e retenção de rascunhos

A migration `20261102005446_flyer_library_draft_retention.sql` adiciona a RPC `sp_flyer_library(p_company_id)`, com metadados de título, status, dimensões, versão e datas canônicas do servidor. A coluna gerada `flyers.library_metadata` mantém uma projeção sem `elements`; abrir a biblioteca não precisa ler nem transportar as imagens incorporadas de todos os documentos. O documento completo continua disponível individualmente em `sp_get`, com `_version` preservado. A RPC exige vínculo ativo, módulo Encartes e a mesma autorização por empresa dos outros acessos. `anon` não recebe EXECUTE.

Somente documentos com `status = draft` e pelo menos 15 dias desde `flyers.updated_at` são elegíveis à exclusão. A data fornecida pelo navegador dentro de `data.updatedAt` não controla a expiração. Uma gravação bem-sucedida renova `updated_at`; artes concluídas são preservadas. A manutenção administrativa `sp_private.expire_flyer_drafts()` não tem grants para `anon` ou `authenticated` e usa os privilégios do invocador. O job `sp-expire-flyer-drafts` em `pg_cron` executa a cada 15 minutos, em lotes de até 200 documentos; documentos em uso por outra transação são pulados com `SKIP LOCKED`. A retenção é independente de navegador aberto. Cada exclusão gera auditoria `expire_draft` e o trigger já existente sinaliza `resource_changes` na empresa correta. Os pixels dos encartes são snapshots JSONB; esta tarefa não exclui arquivos compartilhados do Storage.

Validação local: `supabase/tests/flyer-library-retention.integration.mjs`. Ela executa funções, projection, índice, grants, isolamento, auditoria e sinais reais em PGlite; somente o agendador `cron.schedule` é simulado, porque PGlite não contém o worker pg_cron. A verificação remota está preparada em `supabase/tests/flyer-library-retention.remote-verification.sql` e deve conferir também a extensão/job ativo e o histórico de execução.

**Situação remota em 01/11/2026:** migration **aplicada e conferida por CLI** no projeto `enhoierfwuwtzulznjxa`, sem executar SQL manual no navegador. A CLI oficial 2.108.0 foi usada em diretório temporário, pelo binário `supabase-go --profile supabase`, preservando a configuração do projeto. O erro inicial `401 Invalid access token` vinha de `SUPABASE_ACCESS_TOKEN` no ambiente; excluir essa variável somente de cada comando (`env -u SUPABASE_ACCESS_TOKEN`) permitiu utilizar a credencial padrão válida da CLI. Nenhum token foi exposto/gravado no repositório, nem perfil ou shell global alterado.

O dry-run em cópia temporária alinhada ao histórico remoto listou somente `20261102005446_flyer_library_draft_retention.sql`. `db push --linked --include-all --yes` aplicou essa única migration e registrou versão/nome/11 statements no histórico. O SHA-256 do arquivo é `79b2e41dcc858db845f9463b47da7b301d4ac17499c9ddaefeeca5349d9134cb`; a composição dos statements do histórico tem MD5 `fa2bcf3570900f80e2395a7e2053730b` e corresponde ao SQL local após normalizar apenas comentários/espaçamento. O aviso de Docker indisponível ocorreu no cache local do catálogo depois do push concluído, sem impedir a aplicação.

A conferência remota confirmou RLS nas tabelas, EXECUTE da biblioteca permitido a `authenticated`/negado a `anon`, manutenção negada a ambos, coluna gerada, índice parcial, trigger de sinal e publicação de `resource_changes`. `pg_cron` 1.6.4 mantém o job ativo, pertencente a `postgres`, com intervalo de 15 minutos. O histórico já registra execução automática bem-sucedida em `2026-11-02 02:00 UTC` (`01/11/2026 23:00` em Maceió); a manutenção não foi chamada manualmente como teste. Os três rascunhos existentes, nenhum expirado, foram preservados com hash de conteúdo/versões idêntico antes/depois. A RPC leve retornou três metadados em 891 bytes, sem `elements` ou base64; os documentos completos armazenados somavam 4.959.865 bytes. Isso comprova redução de payload neste conjunto real, sem afirmar uma medição de latência do navegador. Evidência: `artifacts/encartes-20261101/flyer-retention-remote-verification.json`.

## Cotação: seleção múltipla e descontos por fornecedor

Os seletores de produtos combinam busca textual, categoria e subcategoria na mesma linha, com seleção por caixas e opção de marcar todos os resultados filtrados. As marcações sobrevivem à troca de filtros; cada produto recebe a quantidade informada no modal. Fornecedores também aceitam seleção múltipla e busca por nome/CNPJ. Uma confirmação coordena os comandos individuais existentes, em sequência: se uma gravação falhar, os vínculos já confirmados não são repetidos e somente os restantes continuam selecionados para tentar novamente. Os controles ficam bloqueados durante o envio.

A migration `20261102013854_quote_supplier_discounts.sql` acrescenta a ação `setQuoteDiscount` à RPC `sp_command`, mantendo as demais ações no comando privado existente. O desconto pode ser em reais ou percentual, no total de um produto aprovado para determinado fornecedor (`itemDiscounts[itemId][providerId]`) ou no subtotal aprovado de cada fornecedor (`providerDiscounts[providerId]`). O valor em reais é armazenado em centavos; o percentual, em centésimos de ponto percentual. Desconto vazio/zero remove a configuração. O PostgreSQL arredonda cada desconto percentual em centavos, aplica primeiro os descontos das linhas e depois o desconto geral do fornecedor. Rejeita valores negativos, percentuais acima de 100% e descontos maiores que a respectiva base. Um desconto de 100% pode produzir total líquido zero.

As propostas cotadas e a identificação do menor preço permanecem brutas. `computed.awardedByProvider` fornece `grossTotal`, `itemDiscountTotal`, `subtotal`, `discountTotal` e `total` líquido; as linhas aprovadas incluem `grossTotal`, `discount` e `discountTotal`. `computed.selectedTotal` soma os líquidos. O navegador apenas apresenta esses resultados, formata a digitação e salva ao sair do campo. Rascunhos não salvos impedem a finalização/exportação de fornecedores abertos. A edição exige empresa autorizada, `_version` revisada, produto aprovado e fornecedor aberto; fornecedores finalizados mantêm seu snapshot comercial imutável. Gravações seguem `persist_record`, auditoria e `resource_changes` existentes.

O Comparativo final conserva as fotos dos produtos. Cada cabeçalho de fornecedor oferece **Exportar** e **Finalizar**. Exportar abre o visualizador compartilhado em modal, com prévia, **Baixar** e impressão do mesmo PDF; descontos e líquido vêm dos valores canônicos, inclusive nos snapshots finalizados. Finalizar bloqueia apenas o fornecedor correspondente, mantendo os demais abertos.

**Verificação remota em 01/11/2026:** aplicada no projeto `enhoierfwuwtzulznjxa`, pelo SQL Editor autenticado em transação com registro no histórico. O MD5 remoto `20785dbf48efd5bf1ad72e80b9070973` corresponde ao arquivo local. A conferência confirmou RLS, EXECUTE negado a `anon`, gravação direta negada a `authenticated`, wrapper público invocador, implementação privada com autorização e `search_path` vazio, e publicação de `resource_changes`. A única cotação existente foi preservada. Um cálculo remoto com documento sintético retornou bruto 2.000, desconto do produto 200, desconto geral 301 e líquido 1.499 centavos, sem gravar dados comerciais. Evidência: `artifacts/quote-discounts-20261101/remote-verification.json`; consulta reproduzível: `supabase/tests/quote-discounts.remote-verification.sql`.

Validação local: `supabase/tests/quote-discounts.integration.mjs` integra valores, arredondamento, zeros, limpeza, concorrência, isolamento, grants, bloqueio após finalização e sinais. O fluxo de interface foi conferido no navegador com dados sintéticos e respostas calculadas pelo PostgreSQL local, incluindo filtros, lote, preservação de foco, falha de salvamento, botões do cabeçalho, prévia/baixar um PDF real A4 e finalização individual. A renderização do PDF foi inspecionada com Poppler. Essa conferência não alterou nem finalizou a cotação real do usuário.

## Encartes: gravação de snapshots grandes

Diagnóstico de 01/11/2026, por CLI e consultas somente de leitura: a arte com cinco camadas contém 4.352.642 bytes de JSON, dos quais três imagens incorporadas concentram o volume. `authenticated` e `authenticator` usam `statement_timeout = 8s`; nenhum timeout foi aumentado. O validador genérico serializava o documento duas vezes para conferir 25 MB, removia três chaves com três cópias de JSONB e materializava o array de imagens em `jsonb_array_elements`. O EXPLAIN real de leitura do documento mediu 647,654 ms e 532 blocos temporários escritos/lidos; essa medição isolada não atribui os oito segundos inteiros ao validador. As estatísticas agregadas de `sp_save` abrangem todos os recursos e não identificam sozinhas o encarte ou a causa de um timeout anterior. Não havia gravação bloqueada no instante consultado.

A migration `20261102024909_flyer_write_validation.sql` prepara uma validação dedicada de encartes: uma conferência de tamanho, remoção conjunta das chaves de controle, leitura de uma camada por índice e a mesma lista de tipos/imagens permitidas. Permanecem os limites de 25 MB, 200 elementos, dimensões 320–4096, área de até 16 milhões de pixels e geometria positiva. Campos geométricos ausentes/nulos são rejeitados explicitamente. Um dispatch depois da autorização envia somente `flyers` ao novo validador; a função dos demais recursos é preservada integralmente e o patch recusa uma origem inesperada.

A RPC aditiva `sp_flyer_save(p_company_id,p_record,p_expected_version)` prepara uma confirmação compacta `{id,_version,createdAt,updatedAt}`, com datas do servidor. O documento exato continua gravado no PostgreSQL e disponível por `sp_get`; o frontend deve combinar seu snapshot enviado com a confirmação. A gravação lê somente a versão anterior e compartilha a chave/ordem de advisory lock com `persist_record`, impedindo que clientes antigos e novos sobrescrevam uma revisão desatualizada. Autorização por empresa, auditoria e trigger de `resource_changes` permanecem. O contrato de retorno completo de `sp_save` continua disponível para clientes existentes.

Validação local: `supabase/tests/flyer-write.integration.mjs`. Fixture aleatória de 4.351.251 bytes e cinco camadas: EXPLAIN do validador de 25,249 ms para 12,238 ms; escrita temporária de 532 para zero blocos; confirmação de 119 bytes. Esses tempos são do PGlite local, não do navegador nem do Supabase remoto. A cobertura inclui leitura posterior com imagens idênticas byte a byte, concorrência entre as duas RPCs, limites e imagens inválidas, empresa/inativo/anon, privilégios privados, auditoria/sinal e preservação exata dos demais branches de validação. A consulta de conferência remota está em `supabase/tests/flyer-write.remote-verification.sql`.

**Situação remota:** aplicada por CLI oficial no projeto autorizado após revisão e dry-run que listou somente essa migration. Histórico com dez statements, MD5 `2c3a7f8b3671d398796e3c9fc03a64ea`; arquivo local SHA-256 `fb37eef2876aeca4b6ca0c0ff20ad48fe185a4be8383ac30e2b726d248a4ce8f`, conteúdo equivalente ao histórico após normalizar comentários/espaços. `NOTIFY pgrst` recarregou o schema. A conferência confirmou wrapper público invocador, implementação privada com autorização e `search_path` vazio, EXECUTE permitido a `authenticated`/negado a `anon`, helper de validação negado ao app, gravações diretas negadas, RLS, trigger e publicação preservados. O job de retenção continua ativo.

Os dois documentos reais existentes somavam 4.960.205 bytes e mantiveram exatamente o mesmo hash de conteúdo/versões `b6c55e9cc4150d2707fecf4392440949` antes/depois. A mesma consulta EXPLAIN de validação por leitura da arte grande passou de 647,654 ms para 526,687 ms, e de 532 para zero blocos temporários escritos. Essa comparação não mede latência da nova gravação nem do navegador. Nenhum documento real foi salvo, excluído ou modificado para medir desempenho. Evidência completa: `artifacts/encartes-20261101/flyer-write-remote-verification.json`. Comandos CLI de banco devem ser sequenciais: inicializações simultâneas disputam a senha temporária de `cli_login_postgres`; uma consulta de conferência concorrente foi cancelada e refeita sequencialmente com sucesso, sem alterar dados ou credenciais da aplicação.

## Biblioteca: prévias pequenas e cache por versão

A migration `20261102030237_brand_asset_previews.sql` separa a leitura das miniaturas da leitura dos PNGs originais. `preview_data_url` é uma projeção gerada de `data.previewDataURL`; a projeção `metadata` exclui ambos os campos de imagem. A RPC `sp_brand_asset_preview` lê apenas a prévia, ID e versão, com autorização por empresa e rejeição de versão divergente. O trigger valida PNG/base64, até 512 KB de representação e 512 pixels por lado, e descarta a prévia anterior quando o original muda sem uma nova miniatura. Renomear ou reclassificar conserva os pixels da prévia.

Uploads da Biblioteca preparam uma miniatura PNG transparente de até 384 pixels no navegador antes da RPC de gravação. O original permanece com os mesmos bytes e dimensões. O cache de prévias usa o QueryClient comum, empresa/ID/versão, `staleTime: Infinity` e descarte após dez minutos sem uso. A invalidação de `brand_assets` atualiza os metadados; uma versão nova seleciona outra chave de prévia. A troca de sessão/empresa limpa todo o cache. Os cards antecipam a leitura em 180 px e limitam quatro requisições simultâneas. Somente registros antigos que ainda não possuem miniatura usam o original; erros da RPC são propagados.

`scripts/backfill-brand-previews.mjs` prepara e, com `--apply`, grava prévias dos registros existentes pela RPC `sp_brand_asset_preview_save`. A manutenção confere `_version`, gera o sinal normal de `brand_assets` e compara hashes do PNG e de todos os campos anteriores (excluindo somente a nova prévia). Não importa dados de protótipo nem substitui originais. As duas RPCs públicas são invocadoras; implementações privadas exigem acesso ativo e não têm EXECUTE para `anon`/`PUBLIC`. A tabela mantém RLS e gravação direta bloqueada para clientes.

Validação local: `tests/brand-preview-cache.test.mjs`, `tests/brand-previews.test.mjs` e `supabase/tests/brand-media.integration.mjs`. Cobrem cache entre navegações/invalidações, isolamento entre sessões, concorrência de carregamento, rejeição de versões antigas, autorização, limites de imagem, metadados sem pixels, preservação de originais, troca da imagem e sinalização. Migração aplicada em 02/11/2026 pela CLI oficial 2.108.0, em diretório temporário contendo o histórico remoto e somente essa migração pendente. O aviso de Docker indisponível ocorreu no cache local do catálogo após o push, sem impedir a aplicação. Evidências de migração, preparação e conferência ficam em `artifacts/brand-previews-20261102/`.

Conferência remota final: 9/9 registros com prévia; PNGs originais somam 18.662.662 bytes de base64, prévias 1.381.498 bytes (redução de 92,60%), e metadados 1.132 bytes. Os hashes de todos os PNGs e campos anteriores foram preservados. RPCs, projeções geradas, RLS, negação de EXECUTE a anon, trigger de sinal e publicação foram conferidos em `remote-verification.json`; os resultados por arquivo estão em `backfill-verification.json`. A redução é de payload: não representa uma medição de latência no navegador.

## Fontes gratuitas dos cartazes — 02/11/2026

Migração `20261102030842_poster_free_fonts.sql` aplicada e conferida no projeto autorizado. Amplia somente as duas listas de fontes de `sp_private.validate_template` com 20 famílias OFL. Preserva as cinco fontes anteriores e todas as outras validações. Não cria tabelas, endpoints ou permissões e não altera registros. Testes: `npm run test:db`, incluindo `poster-fonts.integration.mjs`; fontes e aplicação: `npm test` e `npm run build`. Execução remota, hashes, licença e lista completa: [FONTES-CARTAZES.md](FONTES-CARTAZES.md).

Conferência adicional da RPC em `2026-11-02 03:14 UTC`, exclusivamente por CLI: a arte real, versão 47 e 4.352.601 bytes, foi lida e copiada para um ID novo `qa-flyer-…`. O helper existe somente em `pg_temp`, é invocador, e chamou a RPC como `authenticated` com o contexto do proprietário, `statement_timeout = 8s` e `lock_timeout = 2s`. A subtransação descartável mediu EXPLAIN ANALYZE de **1.231,092 ms**, sem blocos temporários; a confirmação teve 168 bytes. A leitura por `sp_get` manteve o snapshot de 4.352.610 bytes idêntico ao enviado por hash. Uma exceção deliberada e capturada reverteu a criação, auditoria e sinal antes de devolver o relatório. Uma conexão independente confirmou zero registros/auditorias `qa-flyer-%` e os mesmos dois documentos originais, versões e hash `ba1e5f11f842d05a4175414a967a72c3`. O teste não alterou IDs existentes. Essa medida comprova execução de uma gravação nova dentro do timeout; não mede latência de rede/navegador nem commit de produção. Evidência: `artifacts/encartes-20261101/flyer-write-rollback-verification.json`; SQL reproduzível: `supabase/tests/flyer-write.remote-rollback-verification.sql`.

## Filtros múltiplos de produtos — 02/11/2026

`20261102030247_product_multi_filters.sql` acrescenta `sp_product_page_filtered`, com listas `p_categories` e `p_subcategories`. A consulta aceita qualquer categoria da lista e qualquer subcategoria da lista, combinando os dois filtros; lista vazia não restringe aquele campo. Contagem, limites e paginação permanecem no PostgreSQL. A RPC escalar continua disponível para clientes existentes e consultas com até uma escolha.

Na tela de Produtos, categorias e subcategorias são ordenadas com `Intl.Collator('pt-BR')` e permitem várias escolhas sem fechar o seletor. “Todas” limpa aquele filtro. Alterar categorias preserva somente as subcategorias ainda disponíveis. A URL mantém cada escolha em parâmetros repetidos, incluindo retorno do detalhe, e o cache normaliza conjuntos equivalentes.

A nova função privada exige acesso ao recurso `products`; a pública é invocadora. EXECUTE foi revogado de PUBLIC/anon e concedido a authenticated. Não há alteração de tabelas, dados ou publicação Realtime. A migração foi aplicada pela CLI no projeto autorizado e os totais/permissões foram conferidos remotamente; evidência em `artifacts/catalog-20261102/verification/filters-remote.json`.


## Histórico de preços por fornecedor — 02/11/2026

A migração `20261102031736_quote_offer_history.sql` acrescenta `computed.priceHistory[itemId][providerId]` às respostas de detalhe (`sp_get`) e comandos (`sp_command`) de cotações. O PostgreSQL seleciona a cotação anterior mais recente com preço positivo para o mesmo produto, fornecedor e unidade, sempre dentro da empresa autorizada. A ordem considera data comercial, criação e ID; a própria cotação e as posteriores ficam excluídas. Cotações sem oferta compatível são ignoradas. O retorno contém preço unitário anterior em centavos, data, ID da cotação e direção (`up`, `down`, `equal` ou `none`). A comparação usa o preço unitário antes de descontos. Não altera a escolha manual do vencedor nem grava o histórico derivado no documento.

O índice `quotes_history_order_idx` limita a busca pela empresa e ordem temporal. O histórico é calculado apenas nos retornos individuais, sem ampliar a listagem. A função privada exige autorização para `quotes`; wrappers públicos permanecem invocadores, com `search_path` vazio e execução negada a anon/PUBLIC. O encaminhamento de descontos, controle de versão e sinais existentes são preservados.

Na matriz, o preço anterior aparece discretamente abaixo do campo, com seta vermelha para alta e verde para queda; preço igual não tem seta. A data aparece ao passar o mouse ou focar pelo teclado. Durante um preço ainda não salvo, a direção fica oculta até a confirmação do banco. O controle de vencedor usa um ✓ no canto superior direito da célula, com estado pressionado acessível e destaque verde quando selecionado.

Validação: `npm test` (505 aprovados, 13 ignorados, zero falhas), `npm run test:db` e `npm run build`. A integração `quote-history.integration.mjs` cobre identidade de produto/fornecedor/unidade, preços ausentes, ordem no mesmo dia, exclusão da cotação atual/futura, atualização depois de salvar, isolamento de empresa e negação a inativo/anon. A integração de descontos também carrega a nova migração.

Aplicada pela CLI oficial 2.108.0 no projeto autorizado `enhoierfwuwtzulznjxa`, após dry-run contendo somente essa migração. Uma conexão inicial falhou na autenticação temporária da CLI e foi encerrada; a nova conexão concluiu a aplicação. Conferência remota em `2026-11-02 03:27 UTC`: migração/índice presentes, permissões/RLS corretas, trigger de `resource_changes` e publicação preservados, RPC executada como `authenticated`. A única cotação real mantém versão 30 e MD5 `cbcfa62bba4c0dc8548d45a75f0bca67`; seu histórico está vazio porque não há cotação anterior. Evidências em `artifacts/quote-history-20261102/`; consulta reproduzível em `supabase/tests/quote-history.remote-verification.sql`. Nenhuma cotação real foi criada ou alterada para testar.

## Açougue: espécie, sexo e composição por produtos — 02/11/2026

Migração `20261102032923_butcher_animal_product_models.sql` aplicada no projeto autorizado. Novos modelos usam produtos da empresa, espécie e sexo. KG recebe percentual sobre o peso recebido; UND recebe quantidade inteira por animal, com contagem opcional no recebimento. O banco realiza os cálculos e rejeita soma acima de 100%, referências inválidas e versões concorrentes. Modelos/recebimentos anteriores preservam seus contratos. RLS, grants privados e Realtime foram conferidos.

Foram cadastrados 49 produtos genéricos solicitados, sem preços ou rendimentos predefinidos; 126 produtos existentes foram preservados byte a byte e por versão. Fluxo, fontes de nomenclatura, testes e evidências remotas: [ACOUGUE-MODELOS.md](ACOUGUE-MODELOS.md).


## Desempenho do sistema — 02/11/2026

Quatro migrações de páginas resumidas para seis módulos, calendário por período, rename de Biblioteca sem mídia, correlação Realtime, miniaturas reais de produtos e arquivamento de Tabela de Preços foram aplicadas ao projeto autorizado. Conferência independente preservou os 186 documentos de produto e os 12 documentos/artes existentes; 137 miniaturas foram derivadas sem substituir originais. RLS, grants, publicação e os jobs de 15 dias/90 dias foram verificados. Contratos, testes, medições e limites estão em [Correção de desempenho — banco e mídia](auditorias/2026-11-02-correcao-banco.md).

## Encartes: gravação sem reenviar imagens — 02/11/2026

Migração `20261102160917_flyer_reuse_saved_images.sql` aplicada no projeto autorizado. A RPC `sp_flyer_save_delta` recebe o documento e referências às imagens da mesma arte e versão já persistidas. Exige acesso ativo de escrita, trava o registro por empresa/ID e verifica `_version` antes de restaurar os bytes das imagens e encaminhar à gravação canônica. Referências inválidas ou repetidas são rejeitadas. A RPC anterior continua disponível; RLS, auditoria e sinalização Realtime são preservados.

O frontend compacta apenas imagens exatamente iguais às do snapshot confirmado da mesma versão. Imagens novas e a primeira gravação seguem completas. O prazo das duas RPCs de escrita de encartes é 120 segundos; os demais requests continuam com 20 segundos. Uma resposta de rede interrompida não provoca reenvio automático: uma leitura nova pode confirmar a gravação somente se conteúdo e próxima versão coincidirem exatamente. Sem confirmação, o editor mantém as alterações abertas e apresenta opção de tentar novamente.

Verificação remota descartável: uma cópia da arte de 4.113.458 bytes foi concluída com payload de 5.050 bytes, preservando todas as imagens e camadas. Execução no servidor: 1.467,350 ms na gravação completa e 936,472 ms na compacta. Essas medidas não incluem upload, navegador nem commit; não são garantia de tempo total. A subtransação foi revertida, com hashes dos originais inalterados e zero registros/auditorias de teste restantes. Migração, RLS, negação a anon e ausência de gravação direta foram conferidas. Evidências e SQL reproduzível: `artifacts/flyer-save-abort-20261102/`.

Validação local: `npm test` (591 aprovados, 13 ignorados, zero falhas), `npm run test:db` e `npm run build -- --preserve-chunks`. A integração cobre fidelidade de imagens, referências reordenadas/duplicadas, conflitos de versão, autorização, rollback, conclusão e compatibilidade da RPC anterior. A confirmação visual no navegador da sessão do usuário não foi concluída; a arte original não foi marcada como concluída pelo teste.

## Açougue: cadastro apenas por espécie — 02/11/2026

A migration `20261103003224_butcher_optional_sex.sql` permite criar modelos sem informar sexo. O banco deriva categorias como `Bovino — boi / vaca`, sem atribuir Macho/Fêmea automaticamente. Modelos históricos conservam sexo/categoria, inclusive quando uma edição omite esse campo; os recebimentos existentes permanecem intactos. Composição, pesagem, versões, autorização e sinais Realtime seguem os contratos anteriores.

Aplicada somente essa migration no projeto `enhoierfwuwtzulznjxa`, pela CLI oficial Go 2.108.0 após conferir o dry-run. A consulta remota validou a função sem gravar registros: `no_sex=true`, categoria `Bovino — boi / vaca`, migration presente, RLS ativa, uma política, um trigger, `resource_changes` publicado e execução privada negada a anon/authenticated. Evidência: `artifacts/butcher-dialogs-20261102/remote-validation.json`.

## Açougue: compra e pesagem por quartos — 02/11/2026

A migração `20261103004241_butcher_purchase_entry.sql` acrescenta valor total, anotações e pesagem por dianteiros/traseiros esquerdo/direito às RPCs de recebimento. O PostgreSQL soma os pesos totais das linhas, calcula o custo médio recebido e rateia a compra por peso conservando centavos. A quantidade da linha não multiplica novamente o peso. Os rendimentos cadastrados continuam aplicados uma vez ao total; por isso, partes exigem modelo bovino e os quatro quartos de cada animal. Custos comerciais por corte e precificação ficam para uma etapa posterior.

Aplicação remota e teste autenticado com rollback integral conferidos no projeto autorizado. Modelos, recebimentos e sinais permaneceram preservados no teste; RLS, grants, resumo e publicação Realtime foram verificados. Frontend local recompilado e fluxo completo conferido no Safari com banco PGlite isolado. Contrato, validações e evidências: [ACOUGUE-ENTRADAS.md](ACOUGUE-ENTRADAS.md).
