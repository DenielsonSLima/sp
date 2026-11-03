# Skills do projeto

Skills instaladas localmente em `.agents/skills/`, disponíveis nos próximos turnos do Codex:

Padrão natalino solicitado pelo usuário: [`povo-natal-fotografia`](/Users/denielson/.codex/skills/povo-natal-fotografia/SKILL.md), instalada na pasta pessoal do Codex em 02/11/2026. Inclui âncora visual, pesquisa de produtos, composições de 1–4 SKUs, repetição criativa e cobertura de catálogo. Usar para cenas natalinas da galeria; não substitui as regras técnicas abaixo.

| Skill | Origem | Uso |
| --- | --- | --- |
| `senior-fullstack` | https://github.com/alirezarezvani/claude-skills | Repertório de engenharia e revisão integrada. |
| `senior-backend` | https://github.com/alirezarezvani/claude-skills | Contratos, segurança e arquitetura de backend. |
| `senior-frontend` | https://github.com/alirezarezvani/claude-skills | Interface, acessibilidade e integração de dados. |
| `supabase-postgres-best-practices` | https://github.com/supabase/agent-skills | PostgreSQL, índices, RLS e desempenho. |
| `retail-supermarket-ops` | https://github.com/pankaj8121993-web/claude-skills | Referência de operação varejista de supermercado. |

A skill de varejo encontrada é direcionada à Índia. Aproveitar somente conceitos operacionais gerais quando úteis; não aplicar regras tributárias, sanitárias, trabalhistas, moedas, margens ou metas estrangeiras ao supermercado brasileiro. Novas regras comerciais precisam de evidência do negócio e implementação no banco.

A arquitetura deste projeto já foi definida pelo usuário: Supabase, RPC para cálculos e regras, Realtime e TanStack Query. As skills complementam a execução dentro desse escopo; não exigem escolher outra stack ou alterar o projeto para React.

As skills Supabase e TanStack Query já disponíveis na sessão também foram consultadas durante a integração. Os scripts dos pacotes externos não são necessários para executar o sistema.
