# Supermercado do Povo

## Contrato do projeto

- Projeto Supabase autorizado: `enhoierfwuwtzulznjxa`. Não operar projetos de outros sistemas.
- Frontend em JavaScript modular; manter interface e organização por domínio.
- Arquivos da aplicação em `interno/`, `shared/` e `login/` têm no máximo 500 linhas. Separar responsabilidades em arquivos legíveis, sem compactar código para contornar o limite.
- Cada domínio mantém seus serviços, queries e assinaturas Realtime; hooks coordenam o ciclo de vida e views apresentam os dados. Infraestrutura comum permanece em `shared/data/`, com um único QueryClient. Consultar `docs/ESTRUTURA.md`.
- Supabase Auth controla login. Autorizar por vínculo ativo da empresa e perfil do banco.
- Acessar dados por `shared/data/api.js`, usando RPC e TanStack Query Core.
- Regras, cálculos comerciais, totais, rateios e transições de negócio pertencem às RPCs PostgreSQL. Frontend apenas apresenta resultados e manipula geometria/estado visual.
- Realtime invalida queries por recurso através de `resource_changes`. Toda mutação deve gerar o sinal apropriado, incluindo exclusões.
- Toda tabela exposta exige RLS e autorização por empresa. Nenhuma chave secret/service_role nem senha deve entrar no frontend/repositório.
- Preservar `_version` do registro visualizado para rejeitar gravação concorrente. Limpar caches e rascunhos ao trocar sessão/empresa.
- Não substituir falhas do backend por dados de demonstração ou localStorage.
- Dados do protótipo no navegador não devem ser importados automaticamente.

## Validação

- Após mudanças de código: `npm test` e `npm run build`.
- `npm run check:architecture` verifica o limite por arquivo; o build também executa essa verificação.
- Após mudanças SQL: `npm run test:db`; revisar RLS, grants, cálculos e publicação antes de aplicar remoto.
- Usar migrações versionadas em `supabase/migrations/`; ler `docs/BANCO.md`.
- Registrar verificações remotas com evidência. Testes locais não comprovam deploy nem migração remota.
- A configuração local foi gerada com CLI 2.108.0. Se comandos de migrations falharem com perfil/configuração, usar CLI oficial compatível numa pasta temporária; não sobrescrever a configuração do projeto para contornar erro.

## Skills

Consultar `docs/SKILLS.md` e carregar somente as skills relevantes. Manter o escopo autorizado pelo usuário e não aplicar regras fiscais estrangeiras.
