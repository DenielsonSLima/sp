# Operações — correções de desempenho

Escopo: Cotação, Hortifruti, Açougue/recebimentos e Devoluções. Implementação local em 02/11/2026. A evidência de aplicação remota das RPCs fica com a verificação de banco; testes locais não comprovam deploy.

## Listas e detalhes

- As quatro listas usam páginas resumidas de `sp_resource_page` através dos serviços/queries de cada domínio. Açougue solicita 12 registros; demais listas, 20. Busca, situação e datas são enviadas à RPC.
- As listas não solicitam os documentos integrais, suas linhas, fotos ou assinaturas de imagens para desenhar os cards.
- Cotação, Hortifruti e Devoluções carregam um documento ao abrir o detalhe. Açougue também passou a buscar o recebimento por ID quando se abre “Ver detalhes”.
- Realtime atualiza a página visível. O hook `interno/hooks/use-paged-list.js` conserva cards inalterados e substitui somente os alterados; uma remoção não desmonta todos os demais cards.
- Busca tem debounce de 250 ms. Respostas antigas, respostas depois de sair da tela e chamadas de uma lista substituída não são aplicadas ao DOM.
- Durante troca de filtro, os cards anteriores ficam temporariamente sem ações; os botões de paginação também aguardam a resposta. Uma falha apresenta erro e “Tentar novamente”. Os controles de busca continuam disponíveis.
- Resumos de card não entram no cache de documentos completos do editor. `_version` continua sendo obtido no detalhe para gravação concorrente.
- Filtros de lista são limpos na troca de sessão/empresa.

## Gravação e criação

- A fila de autosave de Hortifruti permite uma gravação em andamento e mantém somente a última edição pendente por chave. Uma confirmação antiga não marca o rascunho mais recente como salvo.
- Preço e quantidade de cartazes não disparam RPC por tecla: aguardam 400 ms ou a saída do campo/Enter. PDF e aplicação em lote aguardam a drenagem da fila.
- A troca de aba do pedido não aguarda a rede. A entrada bruta é enfileirada antes do cálculo de prévia, para que sair da aba durante esse cálculo não perca a edição.
- Cotação atualiza badges e histórico somente na linha do produto afetado. O primeiro rascunho bloqueia as ações de escolha; teclas seguintes não percorrem a matriz. Totais de linha e resumo só são atualizados após confirmação da RPC, sem reescrever marcação idêntica. Descontos seguem a mesma separação entre estado pendente e valores confirmados.
- Açougue e Devoluções compartilham uma fila de prévia com debounce de 180 ms, uma chamada em andamento e somente o último estado pendente. Respostas e erros obsoletos não alteram a tela. No recebimento, digitar data, referência e identificação do animal não pede novo cálculo; peso, quantidade, modo e categoria pedem.
- Criações de pedido, recebimento e devolução têm guarda de operação pendente. Açougue mantém o recebimento retornado pela RPC sem ler toda a coleção depois de registrar.
- Devoluções monta até 30 opções de produto por linha, com busca por nome/unidade e preservação do produto selecionado. O catálogo continua sendo consultado como metadados para essa busca; não se trata de paginação remota desse seletor.

## Validação

- `node --test` nos 7 arquivos focados: 47 testes passaram.
- 6 testes adicionais de matriz e prévia passaram após a última correção.
- `npm test`: 552 passaram, 13 ignorados, 0 falhas (565 testes no workspace compartilhado).
- Verificação de arquitetura executada pelo build: 335 arquivos da aplicação dentro do limite de 500 linhas.
- `npm run build`: passou; runtime validado com 264 módulos.

Novos testes de comportamento cobrem fila lenta sem RPC concorrente, descarte de resposta/erro antigo, atualização incremental de cards e matriz, ausência de escrita de totais durante digitação, erro e retry de paginação, cancelamento de debounce ao sair e busca de produto fora das primeiras 30 opções.

Os testes de DOM usam objetos de teste e RPCs controladas. Não medem latência real de usuários, rede ou PostgreSQL. Os tempos e tamanhos remotos devem ser comparados após a migração e o deploy. As regras comerciais e os totais permanecem no backend.
