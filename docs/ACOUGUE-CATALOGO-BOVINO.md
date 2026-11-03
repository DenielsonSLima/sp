# Catálogo bovino — levantamento e cadastro

Modelo: BOVINO - PADRÃO, empresa Supermercado do Povo. Operação restrita ao projeto enhoierfwuwtzulznjxa.

Foram selecionadas 33 partes: 22 produtos existentes reaproveitados e 11 novos. Cada parte tem três imagens ilustrativas geradas por IA, em PNG com transparência, nas vistas frontal, esquerda e direita. Os arquivos originais gerados foram preservados e as cópias utilizadas estão no projeto.

## Pesquisa e referências visuais

A nomenclatura regional foi confrontada com a [tabela de sinonímia da Embrapa](https://old.cnpgc.embrapa.br/publicacoes/naoseriadas/cortes/textos/sinonimia.html) e com o [catálogo Nordeste Boi](https://www.nordesteboi.com.br/produtos). Foram adotados chã de dentro (coxão mole), chã de fora (coxão duro) e paulista (lagarto).

As fotografias comerciais consultadas serviram para comparar forma, textura, musculatura, gordura e apresentação dos produtos. Referências incluem:

- [Nordeste Boi](https://www.nordesteboi.com.br/produtos): cortes e nomes regionais.
- [Costela do peito](https://catalogoapp.mobi/9e8f6f5680dbb1ed7df1c104d60df537268b4655/product?code=88620-costela-do-peito) e [costela mindinha](https://www.arasuper.com.br/p/costela-bovina-mindinha-kg/1591/): apresentações comerciais distintas. A equivalência dos nomes pode variar por açougue; mindinha não foi declarada sinônimo exato de minga.
- [KarneKeijo — mocotó](https://www.karnekeijo.com.br/mocoto-bovino-inteiro-frigomarca-caixa-25kg-41091-cdrn), [Fine Cut — baço](https://finecut.pe/producto/bazo-de-res/) e [Olímpica — bofe](https://www.olimpica.com/viscera-bofe-importado/p).
- [Prezunic — coração](https://www.prezunic.com.br/coracao-bovino-peca/p), [FrigBrasil — bucho e fígado](https://www.frigbrasil.com.br/prod-outros-produtos.html), [Kasa Villalobos — rim](https://www.kasavillalobos.com/tienda/RINON-DE-RES-KG-p500078560) e [Deskontão — tripa](https://www.deskontao.com.br/tripa-fina-bovina-congelada-boi-brasil-29352-1006).
- [JK Carnes — fraldinha](https://www.jkcarnes.com.br/produto/bovino-sem-osso/fraldinha), [capa de filé](https://www.jkcarnes.com.br/produto/bovino-sem-osso/capa-de-file) e [referência comercial de sebo](https://alexandertelleria.com/compra-y-venta-de-cebo-de-res/).

As imagens dos fornecedores não foram cadastradas como fotografias próprias. O catálogo recebe as imagens geradas, identificadas na descrição como ilustrativas. A revisão visual verifica plausibilidade e apresentação, e não substitui a identificação do corte pelo açougueiro.

## Composição e unidades

Baço, bofe, coração, língua e mocotó estão em UN (apresentação UND). Os demais itens estão em KG.

Osso, sebo e aparas/retalhos são saídas separadas para registrar aproveitamento, venda ou descarte real. Seu cadastro não os classifica automaticamente como perda. Rendimentos, pesos, quantidades por animal e preços não foram inventados.

Peito é apresentado sem osso; costelas são com osso. Alcatra representa o miolo quando picanha e maminha são apuradas separadamente. Não foi acrescentada uma costela genérica nem carne moída como massa adicional. A lista é um catálogo de opções: na pesagem, cada porção física deve entrar apenas uma vez, conforme a desossa efetivamente realizada.

O modelo já possuía dois acéns possíveis no catálogo. Foi mantido um único vínculo de acém no modelo, sem excluir produtos do catálogo e sem remover valores preenchidos. O modelo permanece em elaboração até que sua composição real seja informada e validada.

## Arquivos e evidências

Pasta da operação: [artifacts/bovino-catalogo-20261102](../artifacts/bovino-catalogo-20261102/).

- [Manifesto dos 33 produtos](../artifacts/bovino-catalogo-20261102/manifest.json).
- [Referências visuais consultadas](../artifacts/bovino-catalogo-20261102/references/visual-references.json).
- [Prévia das 99 imagens](../artifacts/bovino-catalogo-20261102/contact.html).
- [Prompts e metadados da geração](../artifacts/bovino-catalogo-20261102/generation-prompts-final.json). Ferramenta: image_gen integrada; uma geração por imagem.
- [Mapeamento dos cadastros](../artifacts/bovino-catalogo-20261102/catalog-applied.json) e [reconciliação do modelo](../artifacts/bovino-catalogo-20261102/model-reconciled.json).
- Evidências individuais de upload e download com SHA-256 em verification/. A conferência consolidada remota é gravada em final-verification.json.

O importador scripts/import-bovine-parts.mjs usa as RPCs públicas existentes, preserva versões, galerias existentes e sinais Realtime. A sessão administrativa é lida do perfil Supabase CLI no chaveiro e mantida somente em memória. As APIs administrativas oficiais de banco e Storage evitam o conflito de login temporário da CLI observado durante o envio. A credencial administrativa do Storage também permanece somente em memória no processo local. Nenhuma credencial entra no frontend ou nos arquivos de evidência. Não houve alteração de esquema para este cadastro.

## Produtos

| Produto | Unidade do banco | Grupo |
| --- | --- | --- |
| CARNE BOV. FILÉ MIGNON KG | KG | carnes |
| CARNE BOV. ACÉM KG | KG | carnes |
| CARNE BOV. ALCATRA KG | KG | carnes |
| CARNE BOV. CONTRAFILÉ KG | KG | carnes |
| CARNE BOV. CHÃ DE FORA (COXÃO DURO) KG | KG | carnes |
| CARNE BOV. CHÃ DE DENTRO (COXÃO MOLE) KG | KG | carnes |
| CARNE BOV. CUPIM KG | KG | carnes |
| CARNE BOV. FRALDINHA KG | KG | carnes |
| CARNE BOV. PAULISTA (LAGARTO) KG | KG | carnes |
| CARNE BOV. MAMINHA KG | KG | carnes |
| CARNE BOV. MÚSCULO KG | KG | carnes |
| CARNE BOV. PALETA KG | KG | carnes |
| CARNE BOV. PATINHO KG | KG | carnes |
| CARNE BOV. PEITO KG | KG | carnes |
| CARNE BOV. PESCOÇO KG | KG | carnes |
| CARNE BOV. PICANHA KG | KG | carnes |
| COSTELA DO PEITO BOVINA KG | KG | carnes |
| COSTELA MINDINHA BOVINA KG | KG | carnes |
| CARNE BOV. CAPA DE FILÉ KG | KG | carnes |
| CARNE BOV. FILÉ DE COSTELA KG | KG | carnes |
| RABADA BOVINA KG | KG | miudos |
| MIÚDO BOV. BUCHO KG | KG | miudos |
| MIÚDO BOV. CORAÇÃO UND | UN | miudos |
| MIÚDO BOV. FÍGADO KG | KG | miudos |
| MIÚDO BOV. LÍNGUA UND | UN | miudos |
| MIÚDO BOV. RIM KG | KG | miudos |
| MOCOTÓ BOV. UND | UN | miudos |
| MIÚDO BOV. BAÇO UND | UN | miudos |
| MIÚDO BOV. BOFE (PULMÃO) UND | UN | miudos |
| MIÚDO BOV. TRIPA LIMPA KG | KG | miudos |
| OSSO BOVINO KG | KG | subprodutos |
| SEBO BOVINO KG | KG | subprodutos |
| APARAS BOVINAS (RETALHOS) KG | KG | subprodutos |

## Verificação final

Conferência remota em 2026-11-03T02:19:53.856593+00:00: 33 produtos, 99 objetos no Storage privado, três imagens e miniatura atual por produto. Arquivos baixados e comparados por SHA-256 com os originais. Modelo com 33 vínculos únicos, versão 6, mantido em elaboração. RLS ativa para produtos e modelos; sinais Realtime presentes. Evidência: [final-verification.json](../artifacts/bovino-catalogo-20261102/final-verification.json).

Validação local: npm test (610 aprovados, 13 ignorados, zero falhas), npm run build e npm run test:db aprovados. Os resultados locais não substituem a conferência remota acima.
