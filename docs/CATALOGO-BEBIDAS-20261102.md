# Bebidas — 02/11/2026

Lote solicitado para o Supermercado do Povo, exclusivamente no projeto `enhoierfwuwtzulznjxa`, empresa `89d1d8c9-b03d-46aa-a743-deac900f93b3`. Pesquisa, geração e revisão divididas entre o agente principal e três agentes auxiliares.

## Produtos selecionados

| Subcategoria de Bebidas | Produtos |
| --- | --- |
| Cervejas | Brahma Chopp lata 350 ml; Itaipava Pilsen lata 350 ml; Heineken long neck 330 ml; Budweiser long neck 330 ml; Skol Pilsen lata 350 ml; Amstel Lager Puro Malte lata 350 ml |
| Vinhos | Quinta do Morgado Tinto Suave 750 ml; Pérgola Tinto Suave 1 L |
| Espumantes | Salton Moscatel 750 ml |
| Sidras | Cereser Maçã Tradicional 660 ml; Cereser Morango 660 ml |

Todos usam unidade UN. A seleção reúne as marcas pedidas e complementos com apresentação comercial confirmada. Não constitui ranking de vendas de Sergipe, nem comprovação de estoque disponível por CEP. Não foram importados preços promocionais ou códigos de barras presumidos. Os códigos do manifesto são identificadores internos.

O vinho referido como “do Morgado” corresponde ao Quinta do Morgado. Cereser foi classificada como sidra, de acordo com o fabricante; Salton Moscatel é espumante. Não foi criada categoria Champagne para esses produtos.

## Pesquisa e imagens

As referências foram pesquisadas e inspecionadas antes de gerar os arquivos. Fontes incluem [Fante — Quinta do Morgado](https://www.fante.com.br/produto/quinta-do-morgado-64/), [Pérgola no GBarbosa](https://www.gbarbosa.com.br/vinho-nacional-pergola-suave-tinto-1-litro-1129848/p), [Salton no GBarbosa](https://www.gbarbosa.com.br/espumante-nacional-salton-moscatel-750ml-1108419/p), [Cereser Tradicional](https://www.institucionalcrsbrands.com.br/?post_produto=cereser-tradicional), [Cereser Morango](https://www.institucionalcrsbrands.com.br/?post_produto=cereser-morango), [Amstel 350 ml](https://www.amstelbrasil.com/produtos/amstel-350ml/) e [Skol no Hiperideal](https://www.hiperideal.com.br/cerveja-skol-pilsen-lata-350ml-46971/p). Demais fontes e URLs diretas das fotos constam nos arquivos de pesquisa dos lotes.

Cada SKU tem três PNGs novos, com transparência real e ângulos `front`, `left`, `right`, gerados por chamadas individuais à ferramenta integrada `image_gen`. As imagens são ilustrações fotográficas identificadas como `source: generated`; microtexto não substitui leitura de rótulo físico. As imagens finais permanecem no workspace em `artifacts/bebidas-20261102/{root,cervejas,vinhos,sidras}/`.

Manifesto consolidado: `artifacts/bebidas-20261102/import.json`. Cada pasta de lote contém manifesto, pesquisa, prompts e evidências de validação. Revisão cruzada: `review-root-vinhos.json` e `review-sidras-cervejas.json`. Os PNGs devem ter pelo menos 1024 px em ambos os eixos, menos de 8 MB e três hashes distintos por produto.

Os 33 PNGs aprovados totalizam 42.478.284 bytes. A inspeção de algumas prévias exibiu cores armazenadas em pixels totalmente transparentes; a composição respeitando o canal alpha confirmou recortes limpos. Evidência: `verification/beer-alpha-contact-sheet.jpg`. Os originais foram mantidos, e variantes experimentais não foram integradas. Essa conferência usa imagens de inspeção compostas; não altera os PNGs finais.

## Execução e conferência

O adaptador administrativo `artifacts/bebidas-20261102/import-cli.mjs` reutiliza o importador existente e testado `scripts/session-import-runner.js`. O projeto, proprietário ativo e bucket privado são conferidos. Metadados são cadastrados por `sp_save`, e a galeria por `sp_product_gallery` sob papel autenticado, com versão esperada. O Storage recebe os PNGs; cada objeto é baixado e seu SHA-256 comparado ao arquivo aprovado. Não há nova migração, alteração de RLS/grants nem mudança do frontend.

O catálogo inicial tinha 175 produtos e cinco itens em Bebidas. `verification/before-products.json` registra hashes e versões para conferir a preservação dos registros anteriores. A evidência consolidada da importação fica em `verification/import-remote.json`; a conferência final está em `verification/catalog-remote.json`.

## Resultado remoto confirmado

- 11 produtos novos em quatro novas subcategorias de Bebidas: Cervejas, Vinhos, Espumantes e Sidras.
- 186 produtos no catálogo completo; 16 em Bebidas.
- 33 objetos presentes no Storage privado e 11 galerias com exatamente `front`, `left`, `right`, todos `source: generated`.
- Zero metadados inválidos, objetos ausentes, imagens inline, classificações incompletas ou registros sem auditoria correspondente à versão atual.
- Sinal Realtime de produtos na revisão 769, com timestamp cobrindo a última gravação deste lote.
- Os 175 produtos anteriores preservaram exatamente suas versões e hashes de dados. Evidência em `verification/preservation.json` e `verification/after-products.json`.
- Todos os 33 arquivos foram baixados após gravação e comparados por SHA-256 com os PNGs aprovados. A retomada após timeout de rede reutilizou os cadastros do lote, sem duplicar produtos ou substituir galerias.

A confirmação final foi feita no banco e no Storage. A tentativa adicional de inspeção pelo Safari não concluiu devido a timeout da automação; não se afirma uma validação visual final na interface autenticada.

Validação local executada: 23 testes específicos de importação/Storage aprovados; build e arquitetura aprovados. A suíte geral retornou 518 aprovados, 13 ignorados e uma falha em `tests/repository.test.mjs`, causada por recurso desconhecido em `interno/hortifruti/pricing-autosave.js`, arquivo não alterado por este lote. Logs em `verification/`. A inclusão de produtos é conferida separadamente no banco e Storage; testes locais não comprovam escrita remota.
