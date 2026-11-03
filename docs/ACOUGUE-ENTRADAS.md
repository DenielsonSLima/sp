# Recebimento do açougue por compra e pesagem

O recebimento usa os modelos já cadastrados em Cadastros → Açougue. O cabeçalho do novo recebimento coleta data, espécie/modelo, quantidade de animais, valor total da compra e anotações; fica em memória até a confirmação do recebimento completo. Nenhuma compra é gravada automaticamente ao continuar para a pesagem.

## Contrato da RPC

`sp_calculate(company,'butcher',input)` produz a prévia. `sp_command(company,'butcher_receipts','create',null,input,null)` registra o snapshot com `expectedModelId` e `expectedModelVersion` da prévia revisada. Continua proibida a edição livre de recebimentos históricos.

O input acrescenta `purchaseTotal` (texto monetário em reais), `notes` (até 4.000 caracteres) e o modo `weightMode: 'parts'`. Nesse modo, `sections` recebe linhas com:

| Campo | Conteúdo |
| --- | --- |
| `type` | `forequarter` para dianteiro ou `hindquarter` para traseiro |
| `side` | `left` ou `right` |
| `quantity` | inteiro entre 1 e 1.000 |
| `weight` | peso total da linha em KG, com até três casas decimais |

O peso da linha já corresponde à quantidade indicada; a RPC não o multiplica novamente. Pode haver linhas separadas ou agregadas da mesma combinação de parte/lado. Os pesos são somados no PostgreSQL.

Como o modelo atual define rendimento sobre o animal inteiro, o modo por partes exige um modelo bovino e, para cada combinação dianteiro/traseiro × esquerdo/direito, a quantidade recebida deve corresponder ao número de animais. Um lote somente de dianteiros exige uma futura ficha própria; não deve gerar picanha por reutilizar percentuais de animal inteiro.

Os modos anteriores `total` e `individual` permanecem compatíveis. No modo total, `weight` representa todo o peso recebido. A composição de cortes é aplicada uma única vez ao peso recebido, conforme a base existente do modelo.

## Valores canônicos e rateio

- `purchaseTotalCents`: valor total da compra em centavos, validado pelo banco.
- `purchaseCostPerKgCents`: custo médio por KG recebido, arredondado em centavos.
- `sections[].weightGrams`: peso total da linha em gramas.
- `sections[].allocatedCostCents`: parcela do custo de compra proporcional ao peso da linha. O método de maiores restos conserva todos os centavos; empates usam a ordem das linhas.
- `purchaseAllocationBasis: 'received_weight'` e `yieldBasis: 'received_total'` documentam os critérios.

Este rateio por peso se refere às partes recebidas. Não implementa custo comercial individual dos cortes nem preços sugeridos. A futura aba Custos precisará definir sua própria regra e referências; valores comerciais não são inventados. Os campos calculados enviados pelo cliente são ignorados em favor da recomputação no banco.

Sem `purchaseTotal`, inputs legados continuam válidos e retornam custo nulo; não há atribuição de custo zero a compras antigas. A migração não regrava recebimentos ou modelos existentes.

## Validação local

Migração: `20261103004241_butcher_purchase_entry.sql`, criada com a CLI Go oficial 2.108.0 em diretório e perfil TOML temporários devido à incompatibilidade do perfil padrão, sem alterar a configuração local do projeto.

`node supabase/tests/butcher-entry.integration.mjs` aprovado. O teste PGlite cobre entrada por peso total, animais individuais, quatro quartos bovinos, quantidades agregadas e linhas repetidas, soma sem multiplicação duplicada, rateio conservando centavos, referências/versionamento de modelo, preservação do histórico, campos canônicos, resumo de lista, RLS, grants e sinal Realtime. A consulta `supabase/tests/butcher-entry.remote-verification.sql` está preparada para conferir o remoto e executar uma criação sintética revertida integralmente; a preparação deste arquivo não comprova sua execução remota.

## Entrega e conferência — 02/11/2026

Na lista operacional, **Novo** abre o modal de identificação da compra. **Continuar para pesagem** abre a página com breadcrumb e retorno à lista; **Editar dados da compra** reabre o cabeçalho. Cancelar o modal não altera os valores confirmados. Os modos de entrada são peso total, quatro quartos bovinos e pesagem individual anterior. O registro final apresenta anotações, compra, média por KG recebido e rateio por peso das partes, conservando o snapshot do modelo.

No detalhe de Cadastros → Açougue, **Custos** é uma terceira aba informativa, junto de Por percentual e Por pesagem. Abrir essa aba não modifica o modo de composição, o rascunho, a versão ou os dados do banco. A configuração de custo comercial dos cortes será desenvolvida posteriormente.

`npm test`: 618 testes, 605 aprovados, 13 ignorados e zero falhas. `npm run build` e `npm run test:db` aprovados. O build conferiu 379 arquivos da aplicação dentro do limite de 500 linhas. Evidências: `artifacts/butcher-entry-20261102/`.

Conferência manual no Safari com aplicação isolada e RPCs reais em PGlite: modal → quatro quartos → prévia → registro → lista → detalhe. Com 40 + 40 + 60 + 60 KG e R$ 6.000,00, retornaram 200 KG, R$ 30,00/KG e parcelas de R$ 1.200,00 / R$ 1.200,00 / R$ 1.800,00 / R$ 1.800,00. O modelo fictício de 2,5% estimou 5 KG de picanha. Anotações e valores foram preservados na leitura posterior. Abrir Custos e retornar preservou a composição e não emitiu mutação. Estes registros existem exclusivamente no banco de teste; não foram importados para o remoto. Evidências: `browser-rpc.json` e `browser-verification.json`.

Migração aplicada por CLI oficial Go 2.108.0 no projeto **enhoierfwuwtzulznjxa**, após dry-run com somente `20261103004241_butcher_purchase_entry.sql` pendente. Foi usado diretório temporário com o histórico remoto e metadados IPv4 existentes, sem sobrescrever a configuração do repositório. SHA-256 da migração: `d5067c2d271c4ce73e0e071b895e9f6093729fe806a491ab368dec274b194ac5`. O aviso sobre Docker ocorreu no cache local do catálogo após a aplicação concluída.

A conferência remota confirmou histórico, RLS, execução pública permitida apenas a authenticated, helpers privados e escrita direta negados, resumo de compra disponível e publicação de resource_changes preservada. O teste executou as RPCs como authenticated com 2 animais, 400 KG e R$ 12.345,67: custo médio R$ 30,86/KG; rateio em centavos `[246914,246913,370370,370370]`. A leitura retornou o snapshot salvo, e a subtransação foi revertida integralmente: hashes de modelos, recebimentos e sinais permaneceram iguais. Evidências: `migration-dry-run.log`, `migration-apply.log`, `remote-inventory.json` e `remote-verification.json`.

Frontend recompilado localmente em `dist/`; nenhuma publicação em hospedagem externa faz parte desta entrega.
