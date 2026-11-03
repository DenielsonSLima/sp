# Supermercado do Povo

Sistema de gestão em português com frontend HTML/CSS/JavaScript modular, Supabase Auth e PostgreSQL. A fonte de dados da aplicação é o projeto Supabase `enhoierfwuwtzulznjxa`.

## Executar localmente

Requisitos: Node.js 22 ou superior e npm.

```sh
npm ci
npm start
```

Abra http://127.0.0.1:4173 e entre com a conta autorizada no Supabase Auth. A conta administrativa inicial está vinculada a `denielsonlima201099@gmail.com`. A senha pertence ao Auth e não fica no repositório.

`npm start` gera `dist/` e inicia o servidor local na porta 4173, restrito a este computador. Para encerrar, use `Ctrl+C`. Após alterar o código, gere novamente ou reinicie o comando.

Para desenvolver, use `npm run dev`: os arquivos são recompilados ao mudar. Atualize a página depois de salvar sua edição no sistema. O servidor usa compressão, ETag e cache para arquivos com hash; o build carrega cada módulo sob demanda.

## Comandos

| Comando | Finalidade |
| --- | --- |
| `npm start` | Gera e serve o site local. |
| `npm run dev` | Serve na porta 4173 e recompila alterações automaticamente. |
| `npm test` | Testes unitários, contratos e adaptadores. |
| `npm run test:db` | Testa a fundação e a migração do catálogo em PostgreSQL/PGlite isolado. |
| `npm run check:runtime` | Confere que a aplicação não importa fixtures, dados de exemplo ou persistência local de registros. |
| `npm run check:architecture` | Confere o limite de 500 linhas por arquivo da aplicação. |
| `npm run build` | Gera arquivos estáticos e bibliotecas em `dist/`. |

Os roteiros `tests/*.browser.mjs` e `tests/browser.cjs` são verificações anteriores que exigem ferramentas e adaptação para o login real. Eles não integram `npm test`. Treze testes Canvas opcionais podem aparecer como ignorados.

## Arquitetura de dados

- `shared/data/config.js`: URL e chave publicável do Supabase. Não contém chave administrativa.
- `shared/data/client.js` e `auth.js`: cliente Supabase e sessão Auth.
- `shared/data/api.js`: acesso RPC, cache TanStack Query Core, invalidação Realtime e isolamento entre empresas/sessões.
- `shared/data/queries/`, `media/` e `realtime.js`: implementação interna de consultas, mídias e assinatura única por empresa, exposta pela API compartilhada.
- Cada pasta de domínio em `interno/` mantém `services.js`, `queries.js` e `realtime.js`; telas complexas separam `hooks/`, views, editores e estilos.
- `interno/cadastros/remote.js`: carregamento dos catálogos e assinaturas por tela.
- `interno/operational-store.js`: snapshots canônicos e comandos operacionais com controle de versão.
- `supabase/migrations/`: migrações versionadas do banco.
- `supabase/tests/`: verificação local e teste remoto transacional, sem dados de teste persistidos.

O frontend envia os campos digitados e as ações. Validações definitivas, permissões, transições e cálculos comerciais acontecem no PostgreSQL por RPC. A interface mantém geometria do editor, formatação e estado temporário dos formulários. Os adaptadores locais antigos existem somente em `tests/fixtures/` e não integram a aplicação. A aplicação usa sempre Supabase RPC e não recorre a dados demonstrativos quando o banco falha.

O Realtime transmite sinais de alteração em `resource_changes`; o cliente invalida o recurso no TanStack Query e relê os dados por RPC. A exclusão de um registro também gera sinal. Vínculos de usuário têm assinatura própria para revalidar alterações de acesso.

## Organização

| Caminho | Conteúdo |
| --- | --- |
| `index.html`, `login/` | Entrada e autenticação. |
| `interno/` | Painel e módulos de gestão. |
| `shared/` | Componentes, estilos e infraestrutura compartilhada. |
| `assets/` | Imagens, catálogos e biblioteca gráfica local. |
| `tests/` | Testes do frontend e dos contratos. |
| `supabase/` | Configuração, esquema, migrações e testes do banco. |
| `docs/` | Mapa do projeto e documentação do banco. |
| `.agents/skills/` | Skills de engenharia, frontend, backend, varejo e PostgreSQL. |
| `.openai/hosting.json` | Identificação do projeto original no Sites. |
| `dist/` | Site gerado, ignorado pelo Git. |
| `artifacts/originais/` | ZIP original e arquivos preexistentes, preservados e ignorados. |

Veja [a estrutura](docs/ESTRUTURA.md), [o contrato do banco](docs/BANCO.md) e [as skills instaladas](docs/SKILLS.md).

## Acesso e manutenção

As tabelas são isoladas por empresa e têm RLS. Usuários sem vínculo ativo não recebem acesso. Gravações diretas nas tabelas são bloqueadas; as RPCs validam a empresa, o perfil e a versão esperada do registro.

Para liberar uma pessoa, sua conta deve existir no Supabase Auth. Depois, um administrador vincula o e-mail a um perfil na tela de Usuários. O cadastro de uma conta Auth, por si só, não concede acesso à empresa.

Os 50 produtos originais e os metadados de categorias, modelos e elementos gráficos foram migrados ao banco com histórico versionado. Dados salvos apenas no navegador do protótipo publicado não são importados automaticamente. O projeto local já usa o banco remoto; as alterações de código desta integração ainda não foram publicadas no site original do ChatGPT.

O catálogo agora tem 83 produtos: os 50 originais e 33 novos itens pesquisados. As 99 imagens novas são PNGs transparentes gerados por IA, com três vistas por produto, armazenados no bucket privado `product-photos`. O frontend resolve URLs assinadas sem persistir links temporários. Manifesto, pesquisa, prompts e verificações estão descritos em [docs/CATALOGO-IMAGENS.md](docs/CATALOGO-IMAGENS.md). As fotos legadas em JSONB continuam compatíveis. Atribuições dos recursos anteriores estão em `assets/ATTRIBUTION.md` e `assets/vendor/`.
