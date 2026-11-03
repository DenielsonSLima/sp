# Resposta ao selecionar vencedor — 02/11/2026

Escopo: sistema local, cotação e integração existente com o projeto autorizado `enhoierfwuwtzulznjxa`. Nenhuma migração ou publicação remota nesta alteração.

## Diagnóstico e alteração

- O clique não indicava gravação pendente e reconstruía a tela completa após a resposta.
- A confirmação de `chooseProvider` aguardava invalidação com refetch de queries ativas, embora a RPC já retornasse a cotação completa e os totais.
- Agora há indicação imediata de gravação, bloqueio de cliques repetidos, atualização da linha e aproveitamento da resposta canônica no cache do detalhe. Leituras antigas em andamento são canceladas antes de preencher o cache.
- A assinatura do detalhe anuncia revisões recebidas pelo Realtime; a atualização explícita preserva rascunhos e a versão realmente visualizada. Nenhuma escolha ou cálculo comercial é antecipado no frontend.

## Evidências e limites

- `npm test`: 618 testes, 605 aprovados, 13 ignorados, zero falhas. Inclui gravação pendente, duplicidade, falha, navegação, cache, concorrência e atualização remota com rascunhos.
- `npm run build -- --preserve-chunks`: passou, incluindo arquitetura e runtime.
- Safari, aba local da cotação DD: antes da atualização mostrava `TimeoutError` e `Reconectando atualizações…`. Após recarregar a versão compilada, carregou os três produtos e cinco fornecedores, com `Atualizações em tempo real ativas`. As duas escolhas existentes e o total de R$ 28,06 foram preservados.
- Sondagem HTTP sem credenciais ao host autorizado: resposta 401 em 0,376 s. Isso comprova alcance do host naquele instante, não o tempo de uma RPC autenticada.
- Não houve alteração de vencedores reais para medir a gravação. A latência da gravação remota e a causa do timeout anterior não ficaram comprovadas; os testes de gravação usam respostas controladas.
