# Correção geral de desempenho — 02/11/2026

Continuação da [auditoria geral](2026-11-02-analise-geral.md), implementada após autorização do usuário. Três agentes dividiram operações, cadastros/gestão e banco/mídia; o agente principal integrou cache, Realtime, navegação, build e validação.

Projeto remoto único: `enhoierfwuwtzulznjxa`. Operações remotas pela CLI oficial; nenhum uso do painel do Supabase para aplicar SQL. Skills aplicadas: senior-frontend, senior-backend, senior-fullstack, Supabase, Supabase Postgres Best Practices e TanStack Query Best Practices.

## Etapa 1 — reduzir chamadas e atualizações repetidas

- Promoções consolida alterações do nome do produto, inclusive `input` seguido de `change`, em uma fila por registro.
- Hortifruti mantém uma gravação ativa e somente a última edição pendente. Preços aguardam pausa na digitação ou saída do campo; ações que exigem dados gravados drenam a fila.
- Prévias de Açougue e Devoluções mantêm uma RPC ativa e somente o último estado pendente. Açougue só recalcula quando os campos de cálculo mudam. Respostas e erros antigos não substituem o estado mais recente.
- Cotação atualiza a linha do produto afetado na matriz; totais e resumos mudam após confirmação da RPC. Digitar preços e descontos não reescreve totais por tecla.
- Realtime identifica a mutação originada no próprio cliente por UUID. O retorno confirmado continua invalidando o recurso uma vez; seu eco não gera uma segunda atualização. Eventos de outros clientes continuam funcionando. Falha após um evento antecipado provoca reconciliação.
- Trocar sessão/empresa cancela leituras, limpa a correlação de mutações e os caches. `_version` continua protegendo edições e transições em lote.
- A mídia de snapshots permanece em cache até o prazo de renovação. Alterar preços não elimina URLs válidas de outras imagens.

## Etapa 2 — reduzir os dados das listas

- Cotação, Hortifruti, Açougue, Devoluções, Promoções e Tabela de preços usam `sp_resource_page`: filtros no banco e páginas de 12 ou 20 registros resumidos. Os resumos não contêm itens completos ou imagens.
- Documentos completos são buscados por ID ao abrir detalhes ou preparar impressão. Versões das páginas permitem transições em lote sem carregar fotos de todos os registros.
- O calendário consulta campanhas resumidas que intersectam o período visível.
- Renomear ou trocar a categoria de um elemento da Biblioteca usa uma RPC de metadados, sem baixar/retransmitir seu PNG.
- Produtos têm miniatura PNG derivada, com dimensões e tamanho limitados. Originais e snapshots comerciais permanecem preservados. O fluxo de envio de novas fotos também prepara o derivado.
- Arquivamento de Tabela de preços saiu do caminho de abertura da tela e passou para rotina do banco, preservando a regra existente de 90 dias e a exceção de itens restaurados.

## Etapa 3 — manter a interface estável

- Listas preservam os cards existentes enquanto aguardam a resposta e reconciliam somente itens alterados/removidos. Busca com debounce conserva o campo e o foco; respostas antigas não substituem resultados recentes.
- Falha de paginação mostra erro e botão de nova tentativa. Cards de um filtro anterior não podem disparar ações durante a troca de filtro.
- Exclusão da Biblioteca remove o card localmente e o restaura se a gravação falhar; imagens inalteradas não são novamente carregadas.
- Navegação conserva menu, cabeçalho, conta e indicador de conexão. Somente o conteúdo do módulo é substituído, encerrando os observadores da tela anterior.
- Unidades/parceiros deixaram de bloquear globalmente a navegação. Cada editor carrega os catálogos dos quais realmente depende.
- Criações operacionais impedem envio repetido enquanto a operação está pendente. Devoluções limita as opções montadas por linha e permite buscar outros produtos.

## Etapa 4 — entrega do código e servidor

- O build empacota/minifica JavaScript, divide o código por importação dinâmica e publica CSS inicial consolidado. Dependências estáticas iniciais recebem `modulepreload`.
- A entrada passou de **27 arquivos JavaScript para 5**, na comparação do grafo de dependências. A carga inicial atual é aproximadamente **305 KB sem compressão / 87 KB gzip**. Isso mede arquivos/bytes, não tempo de abertura do usuário.
- `npm run dev` recompila automaticamente e serve gzip, ETag/304 e cache imutável para nomes com hash. O cache em memória do servidor tem teto de 32 MiB.
- O build é preparado em uma pasta temporária antes da publicação. No modo de desenvolvimento, dependências com hashes anteriores são preservadas e o HTML é substituído ao final, evitando quebrar rotas ainda não abertas em uma aba antiga.
- A estrutura por domínio, services, queries, realtime, hooks e views foi mantida; nenhuma troca de framework foi necessária.

## Evidências de comportamento

| Verificação | Antes | Depois | Ambiente |
| --- | --- | --- | --- |
| Nome de produto em Promoções, 10 `input` + `change` | 11 gravações | 1 gravação | Handler/fila real, transporte controlado |
| Mutação local seguida de eco Realtime | 1 gravação + 2 releituras | 1 gravação + 1 releitura | API real e Query Core, transporte controlado |
| Revalidar 200 cotações/1.000 fotos após editar preço | 995 caminhos reassinados na releitura | 0 na mutação e 0 na releitura | Ensaio sintético, sem baixar pixels |
| Abertura do JavaScript inicial | 27 arquivos | 5 arquivos | Grafo de build |
| Busca em seis listas | Reconstruções e/ou coleção completa | Uma consulta após 12 teclas, foco e cards inalterados preservados | Chrome isolado, RPC interceptada |
| Prévia dos mesmos quatro produtos legados | 3.423.880 bytes | 345.452 bytes, redução de 89,9% | RPC remota autenticada |
| Listagem da cotação existente | 135.375 bytes | 391 bytes no resumo | RPC remota autenticada, um registro |

Evidências locais em `artifacts/auditoria-sistema-20261102/`: `operations-after.json`, `browser-corrections.json`, `http-corrections.json` e logs de testes. O ensaio do navegador não escreve no banco real. Ele também cobre paginação, preservação do shell, período do calendário, largura móvel e navegação após recompilar.

## Validação e publicação

- `npm test`: **552 aprovados, 13 ignorados, nenhuma falha** (565 testes).
- `npm run test:db`: **17 suítes aprovadas**, repetidas após as últimas alterações das quatro migrações; log em `artifacts/system-performance-20261102/database-tests-final.log`.
- `npm run build -- --preserve-chunks`: aprovado; **335 arquivos da aplicação com até 500 linhas**, 264 módulos no grafo de runtime. Carga inicial: 304.601 bytes / 86.593 bytes gzip em 5 arquivos JavaScript.
- `git diff --check`: aprovado.
- Navegador isolado: seis listas, busca/paginação, estabilidade do menu e foco, calendário por período e largura móvel passaram. Durante recompilação, 52 verificações preservaram a página e suas dependências antigas; nenhuma requisição 404 ou erro capturado.
- Servidor de desenvolvimento ativo em `http://127.0.0.1:4173`, com gzip, ETag e respostas 304 conferidos. O frontend não foi publicado em hospedagem externa nesta rodada.

As quatro migrações `20261102040347`, `20261102040438`, `20261102040852` e `20261102043841` foram aplicadas pela CLI e confirmadas no projeto autorizado. A conferência remota registrou:

- **137/137 produtos com foto receberam miniatura**; 49 produtos sem foto permanecem sem derivado. O JSON original dos 186 produtos foi preservado. Cada atualização de miniatura conferiu a versão e o hash da origem.
- Os 12 documentos operacionais, artes e elementos existentes conservaram hashes e versões.
- As quatro RPCs novas mantêm autorização e execução por invocador; `anon` sem execução. As nove tabelas afetadas mantêm RLS e nenhuma escrita direta autenticada.
- A publicação Realtime continua somente com `memberships` e `resource_changes`.
- Rotina de arquivamento de tabelas de preços após 90 dias ativa; rotina existente de exclusão de rascunhos de Encartes após 15 dias preservada. Ambas verificam a cada 15 minutos.

Evidências remotas em `artifacts/system-performance-20261102/`: `migration-apply.txt`, `preservation-and-security.json`, `product-thumbnail-backfill.json`, `rpc-payload-after.json` e planos de execução. Os demais cinco recursos paginados estavam vazios; seu envelope de 162 bytes não é um benchmark com volume de produção.

Relatórios especializados: [operações](2026-11-02-operacoes-correcao.md), [cadastros/gestão](2026-11-02-cadastros-e-gestao.md), [banco e mídia](2026-11-02-correcao-banco.md).

## Limites da conclusão

- As correções tratam mecanismos comprovados na auditoria de todo o sistema. Início, Configurações e cadastros menores também foram revisados; não se alterou seu comportamento sem um gargalo confirmado.
- O seletor de Devoluções limita o DOM a 30 opções mais o item selecionado, mas ainda busca sobre metadados do catálogo. Não é um seletor com paginação remota.
- Não foi executado teste de carga multiusuário nem medição p50/p95 de todas as ações no Safari com volume de produção. Não há promessa percentual de redução da latência total.
- Testes com respostas controladas comprovam os fluxos e contagens, não a latência da conexão do usuário. A conferência remota comprova o banco; não equivale a publicar o frontend em hospedagem externa.
- Há alterações de outras sessões no mesmo diretório. Elas foram preservadas. Contagens de arquivos/testes representam o estado integrado no momento da validação.
