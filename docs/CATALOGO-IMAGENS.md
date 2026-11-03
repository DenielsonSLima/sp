# Catálogo e imagens — 31/10/2026

Projeto autorizado: `enhoierfwuwtzulznjxa`. Empresa: Supermercado do Povo.

## Resultado registrado no Supabase

- 33 produtos novos, 99 PNGs com transparência real, três vistas por produto.
- 83 produtos no catálogo completo, incluindo os 50 anteriores.
- Todos os 33 cadastros têm exatamente `front`, `left` e `right`, sem imagem binária no documento do produto.
- Nenhum objeto ausente e nenhuma divergência entre MIME/tamanho das referências e os objetos reais.
- Bucket `product-photos` privado, até 8 MB por arquivo, tipos PNG/JPEG/WebP; os 99 arquivos deste lote são PNG.
- Todos os arquivos finais têm pelo menos 1024 pixels em ambos os eixos. O conjunto totaliza 143.827.142 bytes.

Consulta de evidência: `supabase/tests/product-storage.remote-verification.sql`. Resultado remoto: 33 cadastros, 99 referências, 33 galerias com três vistas, 0 imagens inline novas, 0 objetos ausentes, 0 metadados inválidos, sinal Realtime de produtos na revisão 116. A importação baixou cada objeto enviado e comparou seu SHA-256 com o arquivo local.

## Arquivos locais e proveniência

Pasta: `artifacts/catalog-20261031/` (fora do runtime e ignorada pelo Git).

- Manifesto final: `manifests/import.json`, com o caminho exato de cada PNG aprovado.
- Imagens finais: `generated/<produto>/`; a cartela de ovos usa `left-clean-v2.png`, conforme o manifesto.
- Fontes: `research-meats.json`, `research-coffee.json`, `research-lamen.json`, `manifest-parcial-nestle.json` e URLs de `manifests/import-root.json`.
- Prompts: `prompts-root.json`, `generation-meats-prompts.json`, `prompts-coffee-angles.json`, `prompts-lamen.json`, `prompts-nestle.txt` e `verification-staple-angles.json`.
- QA: `qa-meats.json`, `qa-nestle.json`, `qa-root-four.json` e verificações por lote, com dimensões, hashes, transparência e prévias compostas em fundos claros/escuros.

As imagens são ilustrações fotográficas geradas por IA pela ferramenta integrada `image_gen`, identificadas no banco como `source: generated`. As fotos enviadas pelo usuário foram usadas para identificar itens; nenhuma captura foi recortada ou reaproveitada como imagem do produto. Referências públicas pesquisadas orientaram marca, embalagem e peso. Os arquivos de referência e variantes descartadas não fazem parte do manifesto importado.

## Itens

Mucilon Multicereais 180 g; Mucilon Arroz e Aveia 180 g; Negresco Original 90 g; Bono Morango, Limão, Doce de Leite, Chocolate e Coco 90 g; Nescafé Original, Matinal e Tradição em sachê de 40 g; Nescau Prontinho 180 ml; café Maratá Tradicional 250 g; açúcar Nota 10 1 kg; Pilar Cream Cracker Premium 350 g; ovos brancos, cartela com 30; arroz Sepé parboilizado 1 kg; espaguete Petyan 400 g; feijão carioca Meu Feijão Tipo 2 1 kg; flocão Pindorama 400 g; lámen Maratá Galinha, Galinha Caipira, Carne e Costela 74 g; coxa/sobrecoxa a granel; galinha Somave; filé de peito SuperFrango 1 kg; peito de frango a granel; músculo bovino com osso; carne bovina moída; salsicha Perdigão; lanche Friella; steak empanado Sadia 100 g.

Os produtos vendidos a granel conservam unidade KG. Não foram importados os preços promocionais dos folhetos. Códigos `CAT26-...` são identificadores internos, não códigos de barras. A quinta variante de Bono foi confirmada como Coco, e o lámen Maratá como 74 g (70 g de massa + 4 g de tempero). A cartela foi contada visualmente: 30 ovos em cada vista final.

## Integração e validação

`shared/data/api.js` resolve referências do bucket em URLs assinadas, com cache por empresa/produto/versão e renovação antecipada. Metadados e galeria são gravados por RPC com `_version`. Encartes materializam os pixels antes de adicionar/substituir produtos ou preencher modelos; os PNGs mantêm alpha e a arte não depende de links temporários. Troca de sessão/empresa ou navegação cancela tarefas pendentes.

A migração Storage foi aplicada remotamente pelo CLI compatível após revisão e `npm run test:db` (quatro suítes aprovadas). Testes finais do frontend: 374 aprovados, 13 opcionais ignorados, 0 falhas; build aprovado com 103 módulos. Cabeçalhos compactos foram conferidos no Safari autenticado, com o catálogo de 83 produtos carregado do Supabase.

O site original hospedado no ChatGPT não foi republicado nesta etapa. O código integrado e validado está na pasta local do projeto.

A galeria de detalhes usa uma área quadrada maior, com proporção 1:1, e a coluna das fotos ocupa mais largura. A imagem fica limitada às duas dimensões do quadrado, centralizada com `object-fit: contain`, sem depender da altura intrínseca da linha de grid; isso corrige o corte inferior observado na embalagem Nescau. O quadrado mantém a proporção em telas menores. Testes e build foram executados novamente após essa correção.
