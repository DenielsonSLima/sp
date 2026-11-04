# Tabela de preços por promoção

Implementada e aplicada no projeto autorizado `enhoierfwuwtzulznjxa` em 03/11/2026, pela CLI oficial Go 2.108.0. O dry-run listou somente esta migração. A autenticação salva funcionou após omitir o token inválido da variável de ambiente, sem alterar credenciais nem a configuração do projeto. Ver `artifacts/price-promotions-20261103/remote-status.json`.

## Fluxo

“Nova promoção” abre um modal com nome, data inicial, data final e observação opcional. Somente salvar cria o registro. Em seguida abre o detalhe com caminho de navegação e botão de voltar.

O catálogo apresenta produtos em **linhas**, com checkbox, foto principal pequena, nome, código, unidade e estado de seleção. Busca e paginação preservam as escolhas; um botão inclui o lote em uma operação. Produtos já incluídos ficam identificados e indisponíveis para duplicação. Produtos sem foto cadastrada mostram “Sem foto”; erros de mídia continuam visíveis.

No detalhe, cada produto permite configurar preço, quantidade, modelo e formato. A seleção tem fundo, borda/faixa e texto próprios. É possível excluir produtos individuais, um lote ou a promoção em rascunho, com confirmação. Envio e finalização continuam nas etapas existentes, preservando dados e modelos usados na impressão. Cartazes individuais anteriores usam o editor legado.

## Contrato e segurança

`price_tables` mantém documentos antigos e acrescenta documentos `kind: "promotion"`, com `name`, `start`, `end`, `notes` e `items`. Não cria tabelas, permissões ou outro módulo. O limite é de 100 produtos distintos por promoção, de 1 a 200 cópias por produto e observação de até 4.000 caracteres. Nome e datas são obrigatórios; o PostgreSQL valida a ordem das datas, preços BRL e a prontidão de todos os produtos antes do envio.

Comandos por `sp_command`: `createPromotion`, `updatePromotion`, `addProducts`, `updateProduct`, `removeProducts` e `deletePromotion`. Alterações e exclusões exigem a versão visualizada do documento pai. Os lotes existentes `send` e `finalize` continuam recebendo `keys` e `expectedVersions`, com ID individual nulo. Bloqueios seguem a mesma ordem para edição e transições em lote.

Fotos novas no snapshot conservam somente a principal, com pixels legados ou referência estável do Storage. Miniaturas do catálogo usam as consultas comuns paginadas; URLs assinadas não são persistidas. O resumo da listagem contém contagens/referências, sem imagens ou modelos completos. Exclusões preservam os cadastros dos produtos e geram auditoria e o sinal `resource_changes` pelo trigger existente.

## Validação e aplicação remota

- `npm test`, `npm run build` e `npm run test:db`; logs em `artifacts/price-promotions-20261103/`.
- Integração SQL: `supabase/tests/price-promotions.integration.mjs`, incluindo lotes atômicos, concorrência, preços, referências, fotos, isolamento por empresa, RLS, grants, auditoria e sinais.
- Interface: testes de modal, seleção entre páginas, respostas tardias, falhas, exclusão disponível e planejamento de PDF, além de conferência no Safari com PGlite isolado. Dados de teste não entram na aplicação nem no banco remoto.
- Migração: `supabase/migrations/20261104012757_price_table_promotions.sql`.
- Aplicada em pasta temporária com configuração gerada pela CLI, marcadores do histórico remoto e somente a migração nova pendente. O aviso de Docker indisponível ocorreu no cache opcional do catálogo local e não impediu a aplicação remota.
- Executado `supabase/tests/price-promotions.remote-verification.sql` como `authenticated`: criação, lote de dois produtos, preço BRL, rejeição atômica de remoção inválida, envio/reabertura e sinal de exclusão. A subtransação foi revertida, conservando documentos, identidades/versões/metadados de produtos, sinais e auditoria.
- Conexão independente confirmou a migração, RLS, execução pública autorizada/privada negada, bloqueio de escrita direta, publicação de `resource_changes` e job de arquivamento. O único rascunho real preservou o hash completo; os 207 produtos conservaram IDs, versões e hash dos metadados. A conferência dos produtos não baixou nem comparou os bytes de todas as fotos. Evidências: `remote-inventory.json`, `migration-dry-run.log`, `migration-apply.log`, `remote-verification.json` e `remote-after.json` no diretório de artefatos.
