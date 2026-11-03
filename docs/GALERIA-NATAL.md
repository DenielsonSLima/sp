# Galeria Natal e Biblioteca — 31/10/2026

## Entrega e funcionamento

A aba **Galeria** no Encarte apresenta fotografias por ocasião de compra, iniciando com Natal: café da manhã, biscoitos e doces, receitas/sobremesas, ceia, cuidados pessoais e casa limpa. Stories usam **1080 × 1920 pixels**, retrato. Cada card oferece prévia ampliada e abertura no editor. A fotografia é incorporada à arte como imagem de fundo bloqueada; preço, textos, selos e logo são camadas independentes. Não há preços promocionais na fotografia ou herdados do cadastro.

Sabores da mesma família são reunidos na composição: cinco Bono, três Nescafé e seis bolinhos Bauducco, por exemplo. As referências são embalagens dos produtos cadastrados; os cenários são fotografias geradas por IA, conforme a identificação apresentada na tela. O catálogo visual não cria produtos nem funciona como fallback do banco. Um cenário só aparece quando todos os seus produtos estão presentes no catálogo da empresa ativa, por ID/código.

A Biblioteca usa categorias reais como pastas. A logo foi recriada em PNG transparente (2146 × 733) e seis selos foram preparados em vermelho, amarelo, branco e preto: Ofertas de Natal, Natal da Economia, Promoção de Natal, Natal Premiado, Natal do Povo e Ceia com Economia. Não foram inventados prêmios, regulamentos ou preços. O botão de logomarca do editor abre a pasta Logos.

## Dados e isolamento

As consultas usam `shared/data/api.js`, RPC e TanStack Query Core. Encartes abrem metadados do catálogo e solicitam fotos principais sob demanda, com fila de duas requisições, deduplicação e expiração. A abertura de Galeria não baixa as três fotos de cada produto. Os pixels da fotografia/cada PNG escolhido ficam incorporados à arte e não dependem de URLs temporárias. Troca de sessão/empresa invalida filas e impede gravações enfileiradas de outra identidade. `_version` é mantido nas gravações.

A Biblioteca passa a listar somente metadados pela RPC `sp_brand_asset_metadata`, com PNG individual via `sp_get`, para evitar o timeout medido ao agregar 15.586.274 bytes de PNGs em uma consulta. A migration correspondente foi testada localmente e aplicada remotamente após a autorização explícita “AUTORIZADO”. A listagem dos sete PNGs agora usa 846 bytes de metadados.

## Importação e proveniência

As oito capturas enviadas pelo usuário orientaram a identificação de novos produtos. Os pixels das capturas não foram reutilizados como fotos de produto, e seus preços não foram importados. Marca, apresentação e variante foram conferidas em fabricantes e outras fontes públicas. Cada novo SKU recebeu três PNGs gerados e distintos: frente, esquerda e direita, com transparência real e pelo menos 1024 pixels por lado. Havaianas conserva observação de que a numeração não foi informada na referência; embalagens antigas/atuais foram documentadas nos relatórios de pesquisa.

Manifestos/QA/pesquisa: `artifacts/catalog-mercearia-20261031/`, `artifacts/catalog-higiene-20261031/`, `artifacts/catalog-higiene-extra-20261031/`. A conta Auth existente no Safari foi reutilizada por uma página operacional **somente local** (`scripts/prepare-session-import.mjs`); não houve coleta, exportação ou persistência de credenciais. As gravações usam as RPCs da empresa autorizada, os PNGs ficam no Storage privado e cada upload é baixado novamente para comparar SHA-256.

A página operacional é gerada em `dist/_reviewed-import`, ignorada pelo Git e removida pelo próximo build. Não é incluída no build de publicação. Seus controles exigem empresa/projeto autorizados e vínculo administrativo ativo, preservam cadastros existentes e reconciliam respostas de gravação ambíguas antes de retomar.

O material de marketing usa a skill `ad-creative`, instalada do repositório público `coreyhaines31/marketingskills`, e os conceitos gerais de sortimento da skill varejista já disponível. A direção criativa usa as referências e a identidade fornecidas; não alega resultados comerciais nem aplica normas estrangeiras.

## Verificação

Evidências remotas ficam em `artifacts/galeria-natal-20261031/remote-lote-*.json`. O lote 01 confirmou 8 novos produtos/24 fotos e 7 PNGs da Biblioteca (91 produtos no total, zero sem classificação). O lote 02 confirmou os 18 registros de seu plano e todos os hashes de fotos; a listagem posterior da Biblioteca encontrou timeout. Diagnóstico remoto por SQL de leitura confirmou então 105 produtos, 7 PNGs, 15.586.274 bytes de imagem e RLS ativa.

Os resultados finais de testes, build, migration remota e conferência visual estão registrados abaixo.


### Cadastros finais conferidos

Catálogo de **83 para 120 produtos**: 37 novos SKUs e **111 PNGs**, três por produto. Todos foram conferidos por leitura remota e SHA-256 dos pixels baixados. Zero produtos sem categoria/subcategoria. A evidência consolidada está em `artifacts/galeria-natal-20261031/remote-consolidado.json`. O último lote foi retomado após um timeout de rede, reconciliando registros e uploads existentes antes de prosseguir. As sete imagens da Biblioteca foram verificadas no lote 01.

Após o bloqueio inicial da revisão automática, o usuário autorizou explicitamente a aplicação pelo SQL Editor e o registro no histórico. A migration foi aplicada em transação no projeto autorizado. Uma consulta posterior confirmou a RPC, a coluna gerada e o MD5 do conteúdo registrado idêntico ao arquivo local (`c339964954f7f191722646da2ab41fac`). RLS ativa; anon sem EXECUTE; authenticated com EXECUTE; publicação Realtime preservada. Evidência: `artifacts/galeria-natal-20261031/brand-metadata-remote-verification.json`.


### Integração final local

**35 cenários** com dimensões conferidas: 1080 × 1920 e miniaturas 360 × 640. Todos os IDs/códigos das composições existem no catálogo verificado. Fotografias completas totalizam 12.486.786 bytes; os cards usam as miniaturas com carregamento preguiçoso. Manifesto de proveniência e hashes: `assets/encartes/galeria/manifest.json`.

`npm test`: **433 testes, 420 aprovados, 13 opcionais ignorados, zero falhas**. `npm run test:db`: oito suítes aprovadas, incluindo autorização da Biblioteca e bloqueio de vínculo inativo. `npm run build`: aprovado, 111 módulos validados, sem dados de teste ou persistência local de registros. O build removeu a página operacional e suas cópias temporárias de fotos.

Conferência real no Safari autenticado: Galeria por cards/filtros, ampliação de cenário, abertura da fotografia como fundo no editor, rascunho salvo e exportação PNG com 1080 × 1920 (3.158.095 bytes). A evidência técnica é `artifacts/galeria-natal-20261031/export-story-qa.json`. O rascunho legítimo “Café com cream cracker · Natal” foi mantido para uso. Após a migration, as pastas Logos (1 PNG) e Natal (6 PNGs) abriram sem timeout. O logo e o selo “Ofertas de Natal” foram inseridos como camadas independentes, o rascunho foi salvo e o PNG exportado com 1080 × 1920, 3.422.833 bytes e SHA-256 `698d3afd8e5d9c440c5deed642019d9562f46fff0a28a8244f9c2bdd0740bc54`. Evidência: `artifacts/galeria-natal-20261031/export-story-logo-selo-qa.json`.

O frontend foi preparado e validado localmente; nenhuma publicação do site original hospedado no ChatGPT foi solicitada ou executada.
