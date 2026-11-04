# Cenas natalinas de chocolates, frutas e ceia — 03/11/2026

Foram criadas **15 imagens novas** com a ferramenta integrada `image_gen`, uma chamada por cena, e duas correções pontuais pela mesma ferramenta. A série mantém o padrão de fotografia acolhedora da galeria: cores naturais, luz lateral, madeira conservada, louça clara, verdes, detalhes vermelhos e pequenas luzes. Varia entre sala de presentes, buffet de sobremesas, bancada de confeitaria e cozinha de preparo.

Distribuição: **8 solos, 5 duplas, 1 trio e 1 quarteto**. Nenhuma cena promove mais de quatro SKUs. Bolo servido e utensílios são ambientação, sem outras embalagens comerciais. Aves e tender permanecem lacrados em superfícies de preparo.

## Arquivos e integração

- Stories WebP: `assets/encartes/galeria/natal/{doces,cozinha,ceia}/natal26-combos-001.webp` até `natal26-combos-015.webp`, conforme a coleção de cada cena.
- Miniaturas: mesmo caminho com sufixo `-thumb.webp`.
- Manifesto completo: `assets/encartes/galeria/natal/combos-20261103.json`, com prompts, referências, fontes, hashes, dimensões reais e revisão por cena.
- Prancha das 15 cenas: `artifacts/natal-combos-20261103/previa-15-cenas.jpg`.
- Galeria local para revisão: `artifacts/natal-combos-20261103/galeria.html`.
- Pacote das 15 imagens: `artifacts/natal-combos-20261103/Natal-15-imagens.zip`.

Os originais têm **941 × 1672 pixels**; foram redimensionados para Stories **1080 × 1920** e miniaturas **360 × 640**, com corte mínimo para ajustar a proporção. Não se trata de geração nativa em 1080 × 1920. Fotografias livres de preço, título, selo promocional e logo da loja; esses elementos continuam como camadas editáveis.

As cenas 001–007 foram acrescentadas ao catálogo local da galeria, reutilizando os IDs já documentados dos três chocolates e posições próprias para os campos editáveis. O total local passou de 118 para **125 cenas**. A disponibilidade continua condicionada ao catálogo real da empresa ativa.

As cenas 008–015 estão entregues como arquivos, com revisão visual concluída, mas **aguardam vínculo com IDs reais de produtos**: frutas cristalizadas La Violetera pote 150g, ave Fiesta Seara, peru Sadia e tender Seara. Não foram inventados IDs nem criados produtos para fazer as imagens aparecerem. A consulta de leitura ao projeto autorizado `enhoierfwuwtzulznjxa` retornou `You do not have permission to perform this action`; evidência em `artifacts/natal-combos-20261103/remote-catalog-check.json`. Isso não comprova ausência desses produtos no banco atual. Não houve escrita no banco ou publicação remota.

## Pesquisa de embalagens

Fontes consultadas em 03/11/2026. Os packshots públicos locais da pesquisa anterior de chocolates foram inspecionados; frutas e produtos de ceia receberam referências públicas baixadas nesta tarefa.

| Produto | Evidência e decisão |
| --- | --- |
| Garoto Garotices 250g | [Panvel](https://www.panvel.com/panvel/caixa-de-bombom-garoto-garotices-250g/p-92740) confirma a apresentação 250g. Preservada a caixa amarela documentada na galeria; outras gramaturas encontradas não substituem esse SKU. |
| Nestlé Especialidades 220g | [Pão de Açúcar](https://www.paodeacucar.com/produto/1642942/caixa-de-bombom-sortido-nestle-especialidades-220g) confirma a apresentação 220g. Mantida caixa vermelha com os chocolates impressos da referência. |
| Lacta Favoritos 250,6g | [Fabricante](https://www.lacta.com.br/lacta/produtos/box-brand-mix-lacta/) informa 250,6g, embora um título secundário abrevie para 250g. Mantida a versão 250,6g e a caixa azul da referência. |
| Frutas cristalizadas La Violetera pote 150g | [Loja do fabricante](https://loja.lavioletera.com.br/produto/fruta-cristalizada-cubinho-la-violetera-pote-150g) e [catálogo 2026](https://lavioletera.com.br/uploads/catalogo-lv-2026-b01.pdf) distinguem pote e pacote. Usado pote transparente baixo, circular, com rótulo na tampa; cubinhos verdes, vermelhos e laranja. |
| Ave Fiesta Seara | [Prezunic](https://www.prezunic.com.br/ave-fiesta-temperada-seara-1139240/p) forneceu o packshot vermelho/amarelo com fecho Seara. A [loja oficial Seara](https://compre.seara.com.br/classica) distingue Fiesta de peru. Mantida ave inteira, sem inventar peso fixo. |
| Peru Sadia temperado congelado | [Fabricante](https://www.sadia.com.br/produtos/comemorativos/aves/peru-temperado-congelado/) confirma nome e EAN 7893000029927. O packshot disponibilizado tem 304 × 304 pixels: serve para forma e identidade principal, sem comprovar microtexto. O selo foi corrigido para “O Nº1 DO NATAL”, conforme a fonte. |
| Tender Bolinha Seara | [Carrefour](https://mercado.carrefour.com.br/produto/tender-bolinha-seara-900g-4773624) apresenta 900g, mas reutiliza packshot cujo nome de arquivo menciona 1,3kg. A imagem foi usada para desenho da embalagem, sem afirmar gramatura comercial. Os 37g impressos representam o peso da embalagem; a ambiguidade foi corrigida na cena solo. |

As imagens geradas não comprovam microtexto, códigos de barras ou QR funcionais. A revisão verificou marca, linha, formato, peso principal quando aplicável, elenco, escala, integração ao ambiente e acabamento natalino. As imagens enviadas pelo usuário orientaram o elenco de ceia; não foram copiadas marcas, preços ou layouts dos supermercados de referência.

## Elenco da série

| Cena | Composição | Situação local |
| --- | --- | --- |
| 001 | Garoto | Integrada à galeria |
| 002 | Nestlé | Integrada à galeria |
| 003 | Lacta | Integrada à galeria |
| 004 | Garoto + Nestlé | Integrada à galeria |
| 005 | Garoto + Lacta | Integrada à galeria |
| 006 | Nestlé + Lacta | Integrada à galeria |
| 007 | Garoto + Nestlé + Lacta | Integrada à galeria |
| 008 | Nestlé + frutas cristalizadas | Arquivo pronto; vínculo pendente |
| 009 | Frutas cristalizadas no preparo do bolo | Arquivo pronto; vínculo pendente |
| 010 | Frutas cristalizadas na sobremesa | Arquivo pronto; vínculo pendente |
| 011 | Garoto + Nestlé + Lacta + frutas cristalizadas | Arquivo pronto; vínculo pendente |
| 012 | Fiesta Seara | Arquivo pronto; vínculo pendente |
| 013 | Peru Sadia | Arquivo pronto; vínculo pendente |
| 014 | Tender Seara | Arquivo pronto; vínculo pendente |
| 015 | Fiesta + tender Seara | Arquivo pronto; vínculo pendente |

## Verificação

Todos os 30 WebPs tiveram dimensões conferidas e SHA-256 registrado. Prancha e cenas individuais inspecionadas. `npm test`: 706 testes, **693 aprovados, 13 ignorados, zero falhas**. `npm run build`: aprovado, incluindo arquitetura, com todos os arquivos da aplicação até 500 linhas. Logs em `artifacts/natal-combos-20261103/`. Nenhuma alteração SQL nesta tarefa; não se alega validação de deploy ou catálogo remoto atual.
