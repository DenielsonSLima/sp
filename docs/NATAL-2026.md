# Biblioteca natalina — entrega de 02/11/2026

Foram integradas 118 cenas, com cobertura de todos os 196 produtos do catálogo confirmado no projeto Supabase `enhoierfwuwtzulznjxa`. O conjunto tem 27 solos, 52 duplas, 32 trios e 7 quartetos, permitindo repetir produtos em ocasiões diferentes. A skill [povo-natal-fotografia](/Users/denielson/.codex/skills/povo-natal-fotografia/SKILL.md) registra a referência e o padrão de produção.

## Cadastros adicionais

Dez produtos ausentes foram cadastrados pelas RPCs existentes. Cada produto recebeu três PNGs transparentes distintos, com dimensões, tamanho e origem gerada registrados. Os 30 arquivos foram baixados novamente do Storage privado e seus hashes conferidos. Não foram inventados preços nem estoque.

| Produto | Apresentação |
|---|---|
| Bombons Garoto Sortidos | 250 g |
| Bombons Lacta Favoritos | 250,6 g |
| Lasanha Vitarella Speciale | 500 g |
| Mussarela fatiada Tirolez | 150 g |
| Uva-passa escura sem sementes La Violetera | 100 g |
| Azeitona verde com caroço La Violetera | 150 g drenado / 240 g líquido |
| Azeitona verde sem caroço La Violetera | 120 g drenado / 250 g líquido |
| Panettone Bauducco frutas e uvas-passas | 400 g |
| Chocottone Bauducco gotas de chocolate | 400 g |
| Suco de uva tinto integral Quinta do Morgado | 500 ml |

Nestlé Especialidades 220 g e sidra Cereser maçã tradicional 660 ml já existiam e foram reutilizados. A consulta final confirmou três imagens em cada um. O suco Quinta do Morgado é um cadastro distinto do vinho da mesma marca.

## Integração e verificação

- 118 arquivos Stories 1080 × 1920 e 118 miniaturas 360 × 640, com hashes no manifesto. Dimensões nativas de 940 ou 941 × 1672 registradas; houve redimensionamento na exportação.
- Removidos os 70 arquivos das 35 cenas antigas e o manifesto parcial obsoleto. Backup de transição em artifacts, fora do build. URLs novas evitam cache antigo.
- Nenhum produto sem cena, nenhum ID desconhecido, máximo de quatro SKUs por composição.
- 118/118 cenas disponíveis para o catálogo final e incorporadas pela função real `prepareSceneDesign`, usando os WebPs locais.
- `npm test`: 552 passaram, 13 ignorados, nenhuma falha. `npm run build`: concluído; arquitetura e runtime aprovados.
- A inspeção da interface pelo navegador ficou indisponível: janela nativa não encontrada e host de acesso ao navegador indisponível. A verificação do editor foi funcional, sem alegar inspeção visual da tela renderizada.
- Cadastros e PNGs foram confirmados remotamente; a biblioteca está integrada ao projeto e ao build local. Não foi feito deploy.

As cenas e recortes são gerados por IA. A revisão confere marca, variante, peso, contexto, escala e aparência principal; microtexto técnico não é um fac-símile certificado.

## Evidências locais

- `artifacts/natal-products-20261102/verification/import-remote.json`: cadastro, versões e hashes remotos.
- `artifacts/natal-products-20261102/catalog-after.json`: leitura final do catálogo.
- `artifacts/natal-biblioteca-20261102/reuniao-direcao.md`: decisões dos três agentes e coordenação.
- `artifacts/natal-biblioteca-20261102/records/`: fontes, prompts e revisões por imagem.
- `artifacts/natal-biblioteca-20261102/integration-result.json`: cobertura e arquivos instalados/removidos.
- `artifacts/natal-biblioteca-20261102/editor-verification.json`: abertura funcional das cenas.
- `artifacts/natal-biblioteca-20261102/npm-test.log` e `npm-build.log`: validação.
