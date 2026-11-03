# Estrutura do projeto

## Entrada e navegação

- `index.html`: documento inicial e referências de recursos.
- `shared/app.js`: inicialização da aplicação e proteção da navegação pela sessão Auth.
- `shared/data/`: Supabase, Auth, RPCs, TanStack Query Core e Realtime.
- `login/login.js` e `login/login.css`: entrada com Supabase Auth.
- `interno/shell.js` e `interno/shell.css`: estrutura visual e menu.
- `interno/modules.js`: registro de módulos, ordem do menu e resolução de rotas por hash.

## Módulos internos

| Diretório em `interno/` | Responsabilidade |
| --- | --- |
| `inicio/` | Painel e resumos. |
| `cotacao/` | Cotações, fornecedores, propostas, escolhas e relatórios. |
| `hortifruti/` | Compra da feira, produtos, pesagens, preços e relatórios. |
| `acougue/` | Operação e recebimentos do açougue. |
| `devolucoes-fornecedores/` | Registro e acompanhamento de devoluções. |
| `calendario/` | Agenda, datas comerciais e feriados. |
| `promocoes/` | Campanhas e materiais de promoção. |
| `tabela-precos/` | Tabelas, agrupamentos e exportação em PDF. |
| `encartes/` | Coleções da galeria, estúdio de criação, biblioteca de marca, camadas e exportação. |
| `cadastros/parceiros/` | Parceiros comerciais. |
| `cadastros/produtos/` | Catálogo, fotos e adaptador RPC de produtos. |
| `cadastros/categorias/` | Cadastro de categorias de produtos no banco. |
| `cadastros/unidades/` | Unidades de medida. |
| `cadastros/acougue/` | Modelos e configurações de cortes. |
| `cadastros/modelos-cartaz/` | Editor e modelos de cartaz. |
| `cadastros/biblioteca-marca/` | Categorias, imagens e biblioteca da marca. |
| `configuracoes/` | Empresa, usuários, perfis, marca d’água e cabeçalho. |

Cada domínio possui `services.js` para operações pela API compartilhada, `queries.js` para consultas consumidas pelas telas e `realtime.js` para assinaturas e descarte. O cache TanStack Query Core fica centralizado; esses arquivos não criam clientes ou caches paralelos. `state.js` e `storage.js` preservam contratos existentes quando necessário.

Telas complexas têm hooks de ciclo de vida e views por fluxo. Produtos separa lista, detalhe e `hooks/use-product-page.js`; Devoluções separa lista, criação, detalhe e liquidação; Açougue separa suas views operacionais. Cotação mantém detalhes, autosave, propostas, fornecedores e relatórios em arquivos próprios. Configurações carrega apenas os recursos usados pelo submódulo aberto.

Em Encartes, `gallery/` organiza coleções e filtros, `editor/` reúne inserção, propriedades, autosave e interação/renderização do canvas, e `views/studio.js` apresenta o espaço de trabalho. `design-library.js` reconcilia cards por ID e versão e limita prévias simultâneas. As camadas permanecem no painel direito; configurações do documento ficam no botão superior. `styles/` separa os estilos sem alterar a ordem da cascata.

`editor/rulers.js` desenha réguas em pixels do documento; `guides.js` cuida de guias arrastáveis e centros; `alignment.js` calcula encaixe e centralização. `viewport-controls.js` reúne esses comandos e `fullscreen.js` expande o estúdio preservando canvas, foco, menus e diálogos. Guias personalizadas são metadados geométricos salvos na arte e redimensionados com ela; as sobreposições não integram o PNG.

O autosave usa `editor/save-queue.js`: gravações são seriais e snapshots ainda não iniciados da mesma arte/sessão são substituídos pelo mais recente; todos os chamadores aguardam a gravação substituta. Desfazer/refazer copia contêineres simples e reaproveita strings imutáveis das imagens, sem serializar todo o base64 a cada movimento. `sp_flyer_save` devolve somente confirmação/versionamento/datas; o cliente combina essa confirmação com o snapshot enviado, conservando o contrato do repositório.

Os hooks são módulos JavaScript de coordenação de carregamento, estado transitório e descarte; a aplicação continua sem React. Regras e cálculos comerciais ficam nas RPCs, conforme `docs/BANCO.md`.

## Código compartilhado

- `shared/base.css`: estilos gerais.
- `shared/icons.js`, `ui.js` e `filters.js`: utilitários de interface.
- `shared/repository.js`: exportação compatível do repositório remoto de produtos.
- `shared/components/`: seletores, entrada monetária, confirmação de saída, visualizador PDF e estilos de abas.
- `shared/data/api.js`: fachada pública de dados, contexto e QueryClient.
- `shared/data/queries/`: consultas por recurso e catálogo, com chaves por empresa e geração da sessão.
- `shared/data/media/`: validação, assinatura e snapshots das mídias.
- `shared/data/realtime.js`: canal por empresa e invalidação por `resource_changes`.
- `shared/data/resource-watch.js`: assinaturas agrupadas por tela, coalescência de atualizações e descarte.
- `interno/operational-store.js`: coordenação comum de snapshots, comandos e versões dos módulos operacionais.

O fluxo é: view/hook → queries ou serviço do domínio → API compartilhada → RPC autorizada. Uma mutação invalida o recurso; o evento Realtime correspondente é agrupado para evitar recarregamentos repetidos. Alterações idênticas preservam o DOM quando a tela suporta reconciliação, e a troca de sessão/empresa descarta caches e trabalho obsoleto.

## Recursos

- `assets/catalogo/`: imagens e manifestos dos catálogos.
- `assets/products/`: imagens de produtos.
- `assets/encartes/`: camadas e recursos gráficos.
- `assets/vendor/konva/`: biblioteca gráfica e licença.
- Demais arquivos em `assets/`: logomarca, foto e arte da navegação.

## Manutenção e validação

Execute `npm test` e `npm run build` a partir da raiz. O build copia `index.html`, `assets/`, `login/`, `interno/` e `shared/` para `dist/` e empacota as dependências de navegador em `dist/vendor/`; documentação, testes, histórico e arquivos de apoio ficam fora do site gerado.

`npm run check:architecture`, também executado no build, exige no máximo 500 linhas em cada arquivo JS/MJS/CSS de `interno/`, `shared/` e `login/`. Esse limite vale para código legível; separar responsabilidades em vez de compactar funções. Migrações históricas, bibliotecas de terceiros, artefatos gerados e fixtures não são fontes da aplicação verificadas por essa regra.

O projeto mantém a organização original por módulos. O ZIP baixado fica em `artifacts/originais/supermercado-do-povo.zip`. A pasta vazia `ss/` e o arquivo vazio `sss.txt`, preexistentes no destino, também foram preservados nesse diretório.

## Banco e integrações

`supabase/migrations/` contém migrações versionadas. `supabase/tests/` valida permissões e regras. `docs/BANCO.md` distingue preparação local de aplicação remota; `docs/VALIDACAO-INTEGRACAO.md` registra verificações. O código das skills locais fica em `.agents/skills/`.

O cadastro de Açougue separa `views/list.js` (identificação do modelo), `views/detail.js` (composição por produto) e `views/product-picker.js` (busca/seleção). `hooks/use-model-editor.js` preserva o rascunho em memória e a versão visualizada. `presentation.js` mantém nomenclatura e rotas. Serviços, queries e Realtime permanecem no domínio; todas as quantidades e rendimentos são validados/calculados no PostgreSQL.

Na operação de Açougue, `views/create-dialog.js` coleta o cabeçalho da compra; `views/create.js` coordena a página de pesagem, prévia e registro; `views/weight-entry.js` apresenta peso total, quartos bovinos e pesagem individual. `common.js` apresenta os snapshots de compra e rateio devolvidos pela RPC. `entry.css` concentra os estilos desse fluxo. A aba Custos do modelo é apenas visual nesta etapa. Ver [ACOUGUE-ENTRADAS.md](ACOUGUE-ENTRADAS.md).

O painel `interno/encartes/layers-panel.js` permite selecionar, ocultar, bloquear e reordenar camadas por arraste ou pelos botões Subir/Descer. `editor/layer-reorder.js` coordena o gesto com captura de ponteiro, indicação de inserção, rolagem nas bordas e cancelamento por Esc/soltura fora da lista. A mudança entra no histórico e no autosave existentes somente ao concluir o arraste; mover várias posições preserva a ordem das camadas intermediárias.
