# Açougue: modelos por espécie, sexo e produto

O cadastro tem duas etapas: nome/espécie/sexo; depois composição em uma rota própria, com breadcrumb e retorno. Espécies: Bovino (boi/vaca), Suíno (porco/porca), Caprino (bode/cabra), Ovino (carneiro/ovelha) e Aves (galo/galinha). Macho e fêmea possuem modelos atuais independentes.

Cada parte referencia um produto da mesma empresa. O banco resolve seu nome e unidade. KG recebe percentual com duas casas decimais, calculado sobre o peso recebido para desossa; a soma das partes ativas não pode superar 100%. UND recebe quantidade inteira por animal. Nos recebimentos, o banco multiplica essa quantidade pelo número de animais; uma contagem manual pode substituí-la, inclusive por zero. UND não consome percentual nem recebe peso estimado. O saldo de KG não distribuído não é classificado automaticamente como perda.

Salvar a composição incrementa sua revisão e preserva snapshots de recebimentos anteriores. A versão do registro visualizado é enviada em alterações e na confirmação da prévia de um recebimento. Mudanças concorrentes são rejeitadas. Rascunhos só existem em memória, sobrevivem à navegação e são limpos na troca de sessão/empresa. Os sinais Realtime existentes invalidam modelos e produtos. Modelos anteriores conservam seus cálculos e podem ser consultados/ativados; criar o novo formato é uma ação explícita.

## Catálogo solicitado

`supabase/seeds/butcher-products-v1.json` documenta 49 produtos genéricos: 23 bovinos (incluindo mocotó em UND), sete suínos, cinco caprinos, cinco ovinos e nove de frango. A migração registra somente produtos ausentes com o mesmo nome/unidade, na empresa Supermercado do Povo. Produtos de marca ou embalados existentes permanecem intactos. Não inclui preços, fotografias, modelos ou percentuais predefinidos. A composição será escolhida pelo usuário, evitando a inclusão simultânea de cortes sobrepostos.

## Pesquisa de nomenclatura

As fontes orientam nomes de cortes, não rendimentos universais:

- [Embrapa — cortes e variação do rendimento bovino](https://cloud.cnpgc.embrapa.br/sac/tag/cortes/): rendimento depende de características do animal; peso vivo e peso de carcaça são bases diferentes.
- [Embrapa — Pecuária de Precisão](https://www.infoteca.cnptia.embrapa.br/infoteca/bitstream/doc/1174001/1/Pecuaria-digital-2025.pdf): nomenclatura bovina, incluindo **coxão mole**, picanha, patinho, alcatra e músculo.
- [Embrapa — Caprinos e ovinos de corte, 500 perguntas](https://www.infoteca.cnptia.embrapa.br/infoteca/bitstream/doc/117241/1/500PCaprinoseOvinosdeCorteed012005.pdf): cortes de caprinos e ovinos.
- [Embrapa/ABCS/MAPA/Sebrae — Bem-estar no frigorífico](https://www.gov.br/agricultura/pt-br/assuntos/producao-animal/arquivos-publicacoes-bem-estar-animal/cartilha-embrapa-abcs-mapa-sebrae-bem-estar-no-frigorifico.pdf/@@download/file): nomenclatura suína, como pernil, paleta, carré, barriga e lombo.
- [SENAR — Processamento de frango](https://sistemafamato.org.br/wp-content/uploads/sites/2/2023/09/Cartilha-89-MT-Processamento-de-Frango.pdf): cortes de peito, coxa, sobrecoxa, asa, dorso, pescoço e miúdos.

## Validação

`npm test`, `npm run build` e `npm run test:db`. O teste `butcher-models.integration.mjs` cobre cadastro, isolamento, grants, concorrência, KG/UND, zero contado, modelos só com UND, independência de sexo, histórico, produtos vinculados, sinais e compatibilidade anterior.

A conferência Safari usa uma aplicação de teste isolada com RPCs executadas em PGlite. Validou criação → detalhe, produtos KG/UND, salvamento, ativação, cálculo de três animais, retorno/rascunho, descarte e busca sem acento. Nenhum modelo de teste foi cadastrado remotamente. Evidências em `artifacts/acougue-20261102/`.

## Situação remota em 02/11/2026

Migração `20261102032923_butcher_animal_product_models.sql` aplicada pela CLI oficial 2.108.0 no projeto `enhoierfwuwtzulznjxa`, após dry-run com somente essa migração pendente. SHA-256 local: `fe6885ddf2f652c3497fa059a005cdd87df2ca9950f70eb5131eee9a53b6fb83`. Histórico remoto: nove statements; MD5 `ba86464166f3cccee1b00b7127641154`.

A comparação confirmou 126 produtos anteriores preservados com hashes e versões idênticos, 49 novos produtos e nenhum modelo/recebimento preexistente alterado. RLS ativa, gravação direta negada, helpers privados sem EXECUTE para o cliente, RPCs públicas sem EXECUTE para anon e sinais/publicação Realtime foram conferidos. O aviso de Docker indisponível ocorreu somente ao tentar guardar o catálogo local depois do push concluído.

`butcher-models.remote-rollback.sql` exercitou as RPCs reais como `authenticated`: criação e ativação de modelo, estimativa e criação de recebimento com versão revisada. Com 750 kg e três animais, 2,5% produziram 18.750 gramas e quatro UND por animal produziram 12 UND; o peso da parte em UND permaneceu nulo. Uma exceção deliberada reverteu integralmente a subtransação, incluindo modelos, recebimentos, auditoria e sinais. Evidência: `remote-rollback.json`.

A aplicação local foi recompilada e a tela conectada foi conferida no Safari. Não houve publicação do frontend em hospedagem externa.

## Ajustes de interface — 02/11/2026

O nome saiu do formulário de composição. O botão **Editar**, ao lado de **Voltar para modelos**, abre um modal para salvar apenas o nome, com a versão revisada e preservação do rascunho de partes. O seletor lista exclusivamente a categoria Açougue, com busca, subcategoria (incluindo Sem subcategoria) e unidade combinadas. Fotos cadastradas aparecem na lista e na composição usando o renderizador de Produtos e as prévias por RPC/cache comum, carregadas conforme entram na área visível. Produtos sem imagem exibem Sem foto. Alterações de categorias também invalidam a tela.

Validação: `npm test` (514 aprovados, 13 ignorados), `npm run build` e conferência Safari isolada com RPCs locais. Evidência: `artifacts/acougue-20261102/browser-picker-edit-verification.json`. Estes ajustes não requerem nova migração nem alteram cadastros remotos.


## Seleção persistente, pesagem e padronização — 02/11/2026

O botão vermelho **Selecionar produtos**, no topo, abre o modal com fotos cadastradas, busca, subcategoria e unidade. Cada adição é gravada imediatamente pela RPC com `_version`; a interface só confirma depois da resposta do banco. Durante a gravação, outras adições ficam desabilitadas. Uma falha mantém a mensagem de erro e permite tentar novamente. As partes aceitam percentual, peso e quantidade ausentes; zero também representa um valor ainda pendente. O modelo permanece **Em elaboração** e não pode ser definido como atual até que todas as partes incluídas tenham valores válidos. Tornar incompleto um modelo atual retira sua indicação de atual. Alterações de valores continuam sendo gravadas pelo botão **Salvar composição**.

A aba **Por pesagem** registra o peso total recebido para desossa de um animal e o peso de cada corte. A RPC `butcher_model_weighing` calcula percentuais, distribuição e saldo; UND permanece por quantidade. Arredondamento por maiores restos mantém a soma dos percentuais correta. Referência, pesos e data ficam registrados no modelo. Campos e resumo usam duas casas decimais no padrão brasileiro, com o mesmo componente de máscara de peso usado no Hortifruti. O peso recebido não é convertido de peso vivo. A correção de JSON nulo permite converter um modelo anterior sem referência para pesagem.

A padronização aplica caixa alta a nomes de produtos, categorias e subcategorias existentes, aos novos salvamentos e à digitação. A migração reutilizou as subcategorias existentes e vinculou os cortes genéricos à classificação correspondente. Conferência remota: 175 nomes de produtos em caixa alta, 53 categorias/subcategorias em caixa alta e nenhum produto do Açougue sem subcategoria. Em 17 registros, o validador de produtos também acrescentou seu campo padrão `photoAssets`; a comparação independente confirmou preservação dos demais campos. Evidências: `artifacts/catalogo-20261102/`.

Migrações aplicadas no projeto autorizado: `20261102035027`, `20261102035310`, `20261102040441` e `20261102040624`. As duas últimas foram publicadas por diretório temporário isolado para não incluir migrações de outras tarefas. Histórico remoto, RLS, grants privados, negação de execução anônima e publicação Realtime conferidos em `artifacts/acougue-20261102/partial-remote-verification.json`. O modelo real escolhido pelo usuário foi salvo com seus quatro cortes e valores vazios, versão 2; recarregar a página confirmou a persistência.

Validação final deste ajuste: `npm test` (519 aprovados, 13 ignorados, zero falhas), `npm run build` e `npm run test:db`. A integração `butcher-weighing.integration.mjs` cobre pesagem, arredondamento, UND, referências, valores parciais, conclusão posterior, bloqueio de ativação, retirada do estado atual, concorrência e permissões. A conferência Safari isolada adicionou KG e UND vazios, recarregou, preencheu 250,00 KG / 5,00 KG / 4 UND, salvou, reabriu e verificou 2,00% na outra aba. Evidência: `browser-weighing-verification.json`. Frontend local atualizado; nenhuma publicação externa foi feita neste ajuste.
