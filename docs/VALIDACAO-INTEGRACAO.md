# Validação da integração Supabase

Data: 30/10/2026, America/Maceio. Projeto remoto: `enhoierfwuwtzulznjxa` (SupermercadoPovo).

## Banco remoto

- Inventário anterior à aplicação: nenhuma tabela pública e nenhum usuário Auth.
- Migration aplicada: `20261031024846_supermarket_database_foundation`.
- Histórico remoto confirmado em `supabase_migrations.schema_migrations`: versão, nome e 72 instruções registradas.
- 24 tabelas públicas; RLS habilitado em todas.
- 7 RPCs públicas com implementação privilegiada em esquema privado.
- Publicação Realtime: somente `memberships` e `resource_changes`.
- Conta Auth administrativa criada com o e-mail informado pelo responsável, vinculada como proprietária à empresa.
- Bootstrap: seis unidades, dois perfis, configurações, categorias da biblioteca e três modelos de cartaz. Nenhum produto ou documento operacional de demonstração importado.

## Verificações

- `npm test`: 353 testes, 340 aprovados, nenhuma falha, 13 testes Canvas opcionais ignorados.
- `npm run test:db`: compilação SQL e testes PostgreSQL/PGlite aprovados, incluindo isolamento, grants, referências, concorrência, cálculos e transições.
- `supabase/tests/remote-smoke.sql`: aprovado no projeto remoto. Fixtures executadas em subtransação revertida; nenhum produto, parceiro ou documento de teste persistido.
- Verificação com duas sessões Supabase Auth reais: leitura dos 21 recursos RPC, RPC anônima bloqueada, gravação de unidade com os mesmos valores de negócio, entrega Realtime à segunda sessão e leitura confirmada da nova versão.
- Navegador: login real, painel com dados do banco, unidades cadastradas, equipe administrativa e indicador de Realtime conectado conferidos.
- `npm run build` e `git diff --check`: aprovados.

A verificação de persistência atualizou apenas a versão/auditoria da unidade UN; nome e sigla foram mantidos.

## Avisos e limites

A auditoria remota não encontrou avisos de desempenho. A auditoria de segurança retornou um aviso de configuração do Auth: proteção contra senhas vazadas desativada. Não foram encontrados avisos relativos às tabelas/RLS/funções criadas.

Os testes locais não substituem QA visual completo de cada fluxo, PDF ou editor. Os testes Canvas opcionais e os roteiros antigos de navegador não foram executados como parte desta integração.

O frontend integrado está no projeto local e disponível pelo servidor local quando iniciado. O site original publicado no ChatGPT não foi atualizado nesta tarefa.

## Migração e remoção dos cadastros locais — 31/10/2026

Aplicadas e confirmadas no histórico remoto as migrations `20261031030545_migrate_existing_catalog` e `20261031031813_optimize_product_media_rpc`. O projeto tem 27 tabelas públicas, todas com RLS, e 8 RPCs públicas.

Contagens conferidas no banco: 50 produtos com foto, 7 categorias de produto, 6 unidades, 3 modelos de cartaz, 11 categorias da biblioteca, 8 modelos de encarte e 6 elementos gráficos. A auditoria registra a importação completa dos 50 produtos, sem substituir registros editados. Fornecedores e operações fictícias não foram importados.

A aplicação não escolhe mais adaptadores locais por Node/DOM. Os singletons usam sempre RPC e iniciam sem registros fixos. Os adaptadores legados existem somente em fixtures de teste. `check:runtime` examina o grafo de 102 módulos da aplicação e bloqueia importações de testes, seeds e persistência local de registros; a verificação integra o build. A persistência da sessão Auth pelo SDK permanece necessária ao login.

Uma consulta de produtos com fotos duplicadas gerava aproximadamente 45 MB e estourou o timeout no teste real. A projeção gerada `products.metadata` passou a somar 27.699 bytes para os 50 produtos. `sp_product_media` entrega fotos uma única vez, em até 8 IDs por chamada; o cliente usa lotes de 4, até 2 simultâneos e cache por empresa/ID/versão. A tela de Produtos foi conferida no navegador com a contagem de 50 registros e fotografias renderizadas. A tela Categorias mostrou os 7 registros vindos do banco.

Validações finais: 363 testes, 350 aprovados, 13 Canvas opcionais ignorados e nenhuma falha; build e grafo de runtime aprovados. As três suítes SQL locais passaram, incluindo integridade do catálogo e segregação de mídia. O smoke test remoto foi executado novamente com rollback, sem persistir fixtures.

## Ampliação do catálogo e Storage

A migration `20261031032723_product_photo_storage.sql` foi aplicada no projeto autorizado após quatro suítes SQL aprovadas. O bucket `product-photos` foi criado privado pelo painel autenticado, com 8 MB por imagem e restrição de MIME. A importação usa Auth normal e as RPCs, sem buscar chaves administrativas; cada upload foi baixado e comparado por SHA-256.

Consulta remota final confirmou 83 produtos totais, 33 novos cadastros, 99 PNGs, três vistas por cadastro, zero objetos ausentes e zero metadados inválidos. Os novos produtos não guardam binários inline. A revisão do sinal `products` chegou a 116. Evidência reproduzível em `supabase/tests/product-storage.remote-verification.sql` e resultado em `artifacts/catalog-20261031/remote-verification.json`.

Galeria, adição/substituição de produtos e preenchimento de modelos materializam imagens assinadas quando necessário, preservam alpha e não persistem URLs temporárias. A sessão e navegação cancelam tarefas obsoletas. Os cabeçalhos foram compactados e conferidos no Safari com o catálogo remoto de 83 itens. A foto principal de detalhes passou a usar um quadrado maior com ajuste proporcional, corrigindo o recorte inferior.

Validação final após esses ajustes: 387 testes, 374 aprovados, 13 opcionais ignorados, zero falhas; build e grafo de 103 módulos aprovados. Detalhes e fontes: `docs/CATALOGO-IMAGENS.md`.

A galeria de Encartes também foi conferida no navegador com os oito modelos carregados por RPC, incluindo os três modelos em camadas. Nenhum novo documento operacional foi criado durante essa conferência.

## Paginação e subcategorias — 31/10/2026

Diagnóstico: a antiga paginação recortava a lista no navegador depois de buscar os 83 produtos e preparar todas as galerias. Metadados completos mediam 69.390 bytes e as galerias legadas, 15.028.725 bytes, além das referências ao Storage. O detalhe também buscava o catálogo inteiro.

A migration `20261031043008_product_server_pagination.sql` foi aplicada remotamente no projeto `enhoierfwuwtzulznjxa` com a CLI oficial compatível 2.58.5 numa pasta temporária, mantendo a configuração local. A verificação remota executou as RPCs com papel `authenticated` e identidade do responsável: 83 produtos, sete categorias principais, 25 subcategorias, zero produtos sem classificação, primeira página de 20 registros/6.049 bytes, cinco páginas e nenhum campo de mídia na resposta. Resultado registrado em `artifacts/catalog-20261031/pagination-remote-verification.json`.

No Safari autenticado, Categorias exibiu tabela com 32 registros, busca “cafe” encontrou “Cafés”, e o filtro Mercearia mostrou a categoria e suas dez subcategorias. Produtos exibiu o novo filtro Subcategoria, que retornou os quatro cafés reais do banco. As imagens são solicitadas depois dos metadados e apenas para a página; os testes verificam lotes de quatro, no máximo dois em paralelo, cache e interrupção de lotes obsoletos. Não foi medida aqui uma redução de tempo ponta a ponta, portanto os bytes acima demonstram redução da resposta inicial, sem prometer um tempo de carregamento específico.

Validação: `npm test` com 392 testes, 379 aprovados, 13 opcionais ignorados, zero falhas; `npm run build` com 103 módulos; cinco suítes de `npm run test:db` aprovadas. Os testes SQL abrangem páginas/filtros, autorização entre empresas, mídia principal, detalhe completo, criação de subcategorias, classificação idempotente, renomeação, dependências e concorrência otimista. A publicação do site original ChatGPT não foi alterada; a interface validada é o projeto local servido em 127.0.0.1:4173.

A apresentação de Categorias foi ajustada para grupos expansíveis: uma linha por categoria principal, botão +/−, subcategorias recuadas e cadastro de subcategoria junto ao nome da categoria. O formulário já recebe o pai correto, com vínculo fixo. Busca por subcategoria abre os resultados; a expansão manual preserva foco de teclado. Conferido no Safari: Açougue expandiu suas quatro subcategorias e seu botão abriu “Nova subcategoria” com Açougue pré-selecionado. O formulário de conferência foi cancelado sem criar registros. `npm test` e `npm run build` passaram novamente, sem mudanças no banco.

## Cotação — criação em modal e carregamento

A tela aguardava a leitura completa do catálogo e suas galerias tanto na criação antiga em quatro etapas quanto nos detalhes. O fluxo foi substituído por um modal nativo em tela cheia com descrição, data e observação; o salvamento abre diretamente a cotação com lista e abas. O catálogo passa a ser consultado por metadados, sem bloquear o detalhe; imagens principais são solicitadas em lotes apenas para os itens pertinentes. O shell mostra um estado de carregamento, e Cotação evita a pré-hidratação duplicada de cadastros.

Migration `20261031050550_quote_header_creation.sql` aplicada ao projeto autorizado com CLI oficial compatível 2.58.5. Verificação remota, sob papel autenticado do proprietário, confirmou criação com listas vazias, observação persistida, total canônico zero e bloqueio de finalização vazia. Executada com rollback: nenhuma cotação de teste permaneceu no banco. Evidência: `supabase/tests/quote-header.remote-verification.sql` e `artifacts/catalog-20261031/quote-header-remote-verification.json`.

Conferido no Safari: listagem com estado vazio explícito e botão Nova cotação; modal ocupando a tela, somente descrição/data/observação e ações; Escape voltou à lista sem gravar. Os testes de interface verificam envio dos três campos, abertura do registro devolvido pela RPC, bloqueio de envio duplicado, erro preservando entradas e descarte de navegação tardia. O detalhe vazio renderiza lista e todas as abas sem consultar o catálogo.

Validação final: 398 testes, 385 aprovados, 13 opcionais ignorados, zero falhas; build/grafo de 104 módulos aprovados; seis suítes SQL passaram. O advisor remoto não acrescentou avisos: permanece somente a configuração pré-existente de proteção de senhas vazadas no Auth. A publicação do site original ChatGPT não foi alterada; a interface conferida foi o projeto local.

## Cotação — ações por aba e organização visual

O quadro de situação, contagem e total foi movido para dentro de Resumo, abaixo das abas. O cabeçalho não repete esses indicadores nem botões de inclusão. Produtos tem uma única ação Adicionar produto, inclusive quando vazio; Fornecedores tem uma única ação Adicionar fornecedor. O comparativo vazio oferece navegação às abas, sem tabela de totais vazia ou finalização indevida. O espaçamento do detalhe foi compactado e a legenda técnica da matriz foi ocultada visualmente com a classe acessível existente.

Adicionar fornecedor abre um modal com busca dos cadastros elegíveis ainda não vinculados e cadastro de um novo fornecedor sem sair da cotação. O cadastro usa a RPC normal de parceiros e o vínculo usa o comando da cotação. Caso o cadastro seja concluído e o vínculo falhe, a repetição reutiliza o cadastro criado. Nenhuma regra ou cálculo comercial mudou, nem permissões foram ampliadas.

Conferido no Safari na cotação existente DD: Resumo com quadro abaixo das abas, Produtos sem o quadro e com um único botão, modal de produtos com fotos e 20 opções dos 83 registros, Fornecedores sem o quadro e com um único botão, modal para cadastrar novo fornecedor com nome/e-mail/telefone. Os dois modais foram cancelados sem adicionar dados à cotação. Testes: 401 totais, 388 aprovados, 13 opcionais ignorados, zero falhas; build/grafo de 105 módulos aprovados.

## Parceiros — modal, CNPJ e apresentação

Migration `20261031054608_partner_company_details.sql` aplicada com CLI oficial compatível. Verificação remota autenticada confirmou validação de CNPJ, persistência do endereço/razão social, bloqueio de duplicidade e preservação de campos em atualização parcial. A transação foi revertida, sem cadastro de teste permanente. Evidência: `supabase/tests/partner-company.remote-verification.sql` e `artifacts/catalog-20261031/partner-company-remote-verification.json`. Sete suítes SQL locais aprovadas.

Novo parceiro e Editar abrem modal, com CNPJ e consulta pública, identificação, contato e endereço editáveis. A consulta real no Safari preencheu os dados empresariais pelo BrasilAPI; o exemplo não foi salvo. Os testes cobrem provedor alternativo, cancelamento, cache por empresa, resposta tardia, digitação concorrente e erros preservando o formulário.

O card separa Cidade/UF, Endereço (logradouro, número e complemento), Bairro e CEP formatado. O seletor de fornecedores da cotação mostra CNPJ abaixo do nome e permite buscar por nome/CNPJ. A fotografia na matriz foi ampliada de 48 para 96 px, com ajuste proporcional sem recorte (80 px em telas estreitas); conferida no Safari na cotação existente, sem alterar dados operacionais.

Validação final: 408 testes, 395 aprovados, 13 Canvas opcionais ignorados e zero falhas; build com 107 módulos aprovado. A interface atualizada é a aplicação local.

## Padronização dos formulários de cadastro em modal — 31/10/2026

Adicionar modelo e Refazer/nova versão em Cadastros/Açougue agora usam modal nativo amplo. Os controles de partes e porcentagens e o salvamento versionado permanecem nos mesmos handlers/RPCs. A confirmação de inativação continua separada. Erros aparecem dentro do modal, sem fechar o formulário.

A revisão encontrou formulários embutidos equivalentes em Categorias/Subcategorias, Unidades, inclusão de Usuários e Perfis, adição de PNGs/categorias da Biblioteca e Aviso da loja. Essas ações passaram a usar o mesmo controlador `shared/form-dialog.js`: título acessível, X/Cancelar/Escape, bloqueio de fechamento durante envio, foco e rolagem restaurados, descarte da interface ao navegar/trocar contexto. Os formulários e versões originais são preservados. Parceiros, Calendário, Cotação e o editor de Modelos de cartaz já tinham modais próprios. As páginas de detalhes e editores extensos de produtos/documentos não foram convertidas nesta revisão dos formulários embutidos.

Validação: 410 testes, 397 aprovados, 13 Canvas opcionais ignorados, zero falhas; build/grafo de 108 módulos e diff --check aprovados. Dois testes novos verificam ciclo de foco/rolagem, cancelamento bloqueado durante envio e descarte ao navegar. Nenhuma mudança SQL ou operação remota de escrita foi necessária. A conferência visual não pôde ser concluída: o Safari interrompeu as ações por mudança concorrente do usuário, o host do navegador integrado estava indisponível e a superfície do Chrome retornou apenas uma imagem cinza. Não houve cadastro de dados durante essas tentativas.


## Galeria Natal e Biblioteca — migration autorizada em 31/10/2026

Após autorização explícita, `20261031070000_brand_asset_metadata.sql` foi aplicada em transação no SQL Editor do projeto autorizado e registrada no histórico. MD5 remoto/local idêntico, RLS ativa, anon sem EXECUTE, authenticated autorizado e publicação `resource_changes` preservada. Sete PNGs (15.586.274 bytes) passam a ter listagem de 846 bytes. Catálogo preservado com 120 produtos, dos quais 37 novos/111 PNGs conferidos por download e SHA-256.

Safari autenticado: Biblioteca mostra Logos com 1 PNG e Natal com 6; logo transparente carregado; inserção do logo e de “Ofertas de Natal” como camadas independentes no rascunho, salvamento e exportação PNG 1080 × 1920 concluídos. Evidências em `artifacts/galeria-natal-20261031/brand-metadata-remote-verification.json` e `export-story-logo-selo-qa.json`. Testes finais: 433 totais, 420 aprovados, 13 opcionais ignorados, zero falhas; oito suítes SQL e build de 111 módulos aprovados. Frontend validado localmente, sem publicar o site original.


## Seleção compacta e logo com contorno — 31/10/2026

O Transformer do Konva já trabalha em pixels de tela. Foi removida a divisão indevida pelo zoom: alças agora têm 7 px, borda e traço das alças 1 px, cor azul suave e distância de rotação 20 px. A área invisível de toque permanece ampliada por `hitStrokeWidth`. A geometria foi conferida com a biblioteca real nos zooms 25%, 28,8%, 50% e 100%, e o módulo real foi inspecionado visualmente no Safari em uma página local isolada, com alças pequenas ao redor da logo. A aba original em edição pelo usuário foi preservada. Evidência reproduzível em `artifacts/logo-contorno-20261031/selection-review.html` e `selection-geometry-qa.json`.

A variante “Supermercado do Povo · Contorno branco” (PNG RGBA, 2146 × 733) foi cadastrada em Logos e conferida por leitura remota e SHA-256. A versão original foi preservada. Evidência: `artifacts/logo-contorno-20261031/remote-verification.json`.


A pedido do usuário, foi criada ainda a variante “Supermercado do Povo · Contorno branco 4x”, com traço branco aproximadamente quatro vezes mais grosso, preservando as outras versões. PNG RGBA 1796 × 876, transparência real e margem ao redor da marca; cadastrado na pasta Logos e conferido por leitura remota e SHA-256 (`remote-4x-verification.json`). O manifesto contém agora nove PNGs: três logos e seis selos. Validação final: 433 testes, 420 aprovados, 13 opcionais ignorados e zero falhas; build e grafo de 111 módulos aprovados. Nenhuma migration nem publicação do site nesta alteração.

## Modularização e estúdio — 01 e 02/11/2026

Três agentes dividiram Cadastros, Operações e Ofertas/Configurações; a infraestrutura compartilhada e Encartes foram integrados pela coordenação. Serviços, consultas e Realtime ficam por domínio, usando a API e o QueryClient centrais. Hooks, views, editores, mídia e estilos foram separados por responsabilidade. O build verifica até 500 linhas por fonte da aplicação; resultado final desta rodada: 305 arquivos JS/CSS, maior com 500 linhas, grafo de 238 módulos. Arquivos de outros trabalhos simultâneos foram preservados.

Encartes remove Modelos, Produtos, Fundos e selos e ações de backup da interface. A Galeria abre a coleção Natalina; pesquisa/categoria/subcategoria ficam em uma linha nas duas etapas. O estúdio mantém ferramentas à esquerda e propriedades/camadas à direita, configurações de documento em modal e expansão para a área inteira da janela. Réguas usam coordenadas reais do documento, zoom e pan; guias são puxadas das réguas, reposicionadas, removidas fora da arte e salvas como geometria da arte. Centro horizontal/vertical, centralização explícita e encaixe de bordas/centro oferecem orientação; Alt suspende o encaixe. Guias não entram no PNG.

Safari autenticado foi usado apenas na conferência visual da Galeria, carregamento de rascunhos, estúdio, seleção de camada e diálogo Configurações cancelado sem gravar. Réguas/guias/tela cheia foram verificadas por testes de geometria e ciclo de eventos; não foi feita nova operação de banco pelo navegador. As migrations de biblioteca/retenção e confirmação compacta de gravação foram aplicadas por CLI oficial no projeto autorizado, com evidências e hashes descritos em `BANCO.md`.

Exclusões reconciliam o card por ID/versão e preservam prévias dos demais. Leitura inicial usa metadados, com snapshots individuais e prévias limitadas. Autosave serial substitui snapshots obsoletos ainda aguardando envio; histórico evita cópias JSON repetidas das imagens. Gravação usa `sp_flyer_save`, devolvendo apenas confirmação/versão/datas. Esses testes e a redução de payload não equivalem a um benchmark completo da navegação do usuário.

Validação: `npm test` com 514 testes, 501 aprovados, 13 Canvas opcionais ignorados, zero falhas; `npm run test:db`, `npm run build` e `git diff --check` aprovados. Casos novos cobrem isolamento de sessão, exclusão concorrente, imagens assíncronas, fila de gravação, histórico, réguas/DPR, drag de guias, encaixe rotacionado, menus/tela cheia e centralização. O servidor local continua na porta 4173; não houve publicação de frontend nesta rodada.

## Produtos — filtros múltiplos em 02/11/2026

Aplicada exclusivamente `20261102030247_product_multi_filters.sql` ao projeto `enhoierfwuwtzulznjxa`, pela CLI oficial 2.79.0 em diretório temporário, com plano `db push --dry-run` conferido. A configuração do projeto e o perfil global foram preservados. O comando usa `--profile supabase` e remove somente da execução o `SUPABASE_ACCESS_TOKEN` de ambiente que sobrepunha a credencial válida salva na CLI.

Validação local: `npm test`, `npm run test:db` e `npm run build` aprovados. Casos novos cobrem filtros por conjuntos, URLs com acentos/vírgulas, paginação, interseção categoria/subcategoria, entradas inválidas, isolamento entre empresas e bloqueio anônimo. A consulta remota autenticada encontrou 58 registros em Mercearia/Bebidas, exatamente o total esperado, com 20 metadados na página e nenhuma foto no payload. RLS de produtos ativa, EXECUTE negado a anon e permitido a authenticated, `resource_changes` ainda publicado. Evidência: `artifacts/catalog-20261102/verification/filters-remote.json`.

Advisor de segurança consultado pela CLI: nenhum aviso referente às novas RPCs. O único aviso retornado foi `auth_leaked_password_protection`, configuração Auth não alterada nesta tarefa; resultado em `artifacts/catalog-20261102/verification/security-advisors.json`.

### Produtos: desempenho e lote de 02/11/2026

Lote de seis produtos e 18 PNGs concluído via CLI oficial, RPCs autenticadas e bucket privado; objetos baixados e conferidos por hash. Consulta final sem objetos ausentes/metadados inválidos, três ângulos por produto. Detalhes em `docs/CATALOGO-20261102.md`.

Após o lote, três agentes auditaram paginação, cache/Realtime e mídia. Medições remotas somente leitura comprovaram páginas limitadas e separação dos metadados; correções locais tratam cache versionado, visibilidade, geração da página, falhas e renovação de URLs. Validação final: 517 testes passaram, 13 ignorados, zero falhas, build aprovado e dist atualizado. Evidências e limites em `docs/DESEMPENHO-PRODUTOS-20261102.md`. Sem nova migração SQL nesta etapa.

## Açougue: modais e remoção do campo Sexo — 02/11/2026

O modal Editar modelo ganhou campo em largura completa e 24 px entre o campo e os botões. Novo modelo solicita somente nome e espécie. Textos de cadastro, composição e recebimento foram ajustados. O banco aceita modelos sem sexo e preserva categorias históricas, sem reclassificar documentos existentes.

Validação: `npm test` com 605 aprovados, 13 opcionais ignorados e zero falhas; `npm run test:db`, `npm run build` e `git diff --check` aprovados. O teste SQL cobre as cinco espécies sem sexo, criação/ativação/recebimento com KG e UND, espécie inválida, concorrência e edição histórica com preservação da pesagem. Chrome isolado conferiu espaçamento, foco, salvar/cancelar e ausência de overflow no modal de edição em 1440/768/390/320 px; criação com dois campos, opções e validade do formulário em 1440/390 px. Nenhuma gravação remota foi feita pelo navegador; capturas em `artifacts/butcher-dialogs-20261102/`.

Migration `20261103003224_butcher_optional_sex.sql` aplicada e confirmada no projeto autorizado. Consulta remota da função, sem persistência, retornou categoria `Bovino — boi / vaca` e `no_sex=true`; RLS, grants privados e publicação preservados. Advisor de segurança sem avisos relativos à correção; permanece apenas o aviso Auth preexistente de proteção contra senhas vazadas. Evidências: `remote-validation.json` e `security-advisors.json` na mesma pasta. O frontend foi compilado em `dist/`; não houve publicação externa do frontend.

## Encartes: arraste na lista de camadas — 02/11/2026

Implementada reordenação pelo nome/miniatura, com indicação de inserção, rolagem nas bordas, Esc para cancelar e descarte ao soltar fora da lista. A lista é invertida em relação ao documento; a inserção preserva a ordem das camadas intermediárias e usa o histórico/autosave existentes. Visibilidade, bloqueio e botões Subir/Descer permanecem operantes.

`npm test`: 609 aprovados, 13 opcionais ignorados, zero falhas. Build e arquitetura aprovados. `tests/flyer-layer-reorder.test.mjs` cobre inserção, limites, direção visual e desfazer/refazer. Chrome isolado executou `tests/flyer-layer-reorder.browser.mjs`: arrastes nas duas direções, seleção, cancelamento, soltura fora da lista, visibilidade, botões, rolagem, uma gravação de histórico por gesto e descarte do controlador. Nenhum documento real ou banco foi alterado nessa conferência; o build está em `dist/`.

## Açougue: nome do modelo no recebimento — 02/11/2026

O seletor e o cabeçalho de novos recebimentos exibem o nome salvo do modelo, com o rótulo Modelo de composição. A categoria permanece como identificador do contrato RPC. A apresentação usa o modelo atual, ou o único modelo ativo quando ainda em elaboração; vários rascunhos sem atual não recebem seleção implícita. O modal acompanha alterações de `butcher_models` por assinatura do domínio sem apagar os campos da compra. Snapshots de recebimentos anteriores não foram alterados.

`npm test`: 610 aprovados, 13 opcionais ignorados e zero falhas; build e `git diff --check` aprovados. Teste unitário cobre renomeação, categoria estável, rascunho único e ambiguidade. Chrome isolado confirmou o nome salvo e a renomeação no seletor personalizado real, com o valor interno da categoria preservado e sem gravação remota. Consulta somente leitura no projeto autorizado confirmou que o modelo existente estava ativo, ainda sem definição como atual; nenhuma migração foi necessária.
