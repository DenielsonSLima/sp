# Produtos: paginação e carregamento — 02/11/2026

Três agentes revisaram separadamente banco/paginação, cache/Realtime e mídia, após concluir o lote de seis produtos com 18 imagens. A revisão e as medições usaram código, testes e CLI, sem automação do navegador.

## Diagnóstico confirmado

- A lista já pagina no PostgreSQL: **20 cards ou 25 linhas** por consulta, filtros e contagem no servidor. Não baixa o catálogo completo para paginar no cliente.
- Metadados da primeira página: **6.051 bytes**, sem fotos, **24,114 ms** em uma amostra de execução no banco.
- As vinte fotos legadas dessa página somam **6.369.264 bytes** de strings base64; o JSON da RPC completa soma 6.371.159 bytes. Um lote de quatro levou **161,831 ms** no banco. A UI usa lotes, não uma chamada de vinte.
- Outra página referencia **31.851.061 bytes** de originais no Storage. A assinatura da URL é pequena, mas o arquivo servido continua sendo o original.
- `loading="lazy"` no elemento `<img>` não adiava a transferência dos pixels legados, porque já estavam na resposta JSON.
- Atualizações da mesma página invalidavam a geração das fotos em andamento, mas retornavam cedo pela mesma assinatura da página. Isso podia deixar “Carregando foto…” indefinidamente.
- Qualquer sinal `products` removia todas as fotos do cache, embora as chaves já distinguissem empresa, produto e `_version`.

Tamanhos JSON são anteriores à compressão HTTP; tempos são amostras SQL, não percentis nem tempo de tela. O catálogo tinha 175 produtos durante a auditoria, por alterações concorrentes de outros trabalhos. Isso não altera a evidência do nosso lote: seis novos registros e 18 imagens verificados ao final da importação.

## Correções aplicadas

1. **Carregamento por visibilidade:** IntersectionObserver solicita fotos apenas dos cards/linhas da página atual que entram na tela ou ficam até 250 px dela. Fila com lotes de até quatro, no máximo dois simultâneos. Sem suporte à API, o fallback continua restrito à página atual.
2. **Ciclos de vida separados:** recarregar metadados iguais preserva a fila de fotos. Uma página efetivamente diferente descarta o observador anterior; sair da tela desconecta os observadores e bloqueia resultados atrasados.
3. **Cache por versão:** eventos Realtime invalidam metadados, preservando imagens de versões inalteradas. Mudanças de `_version` escolhem outra chave; URLs vencidas são renovadas. Troca de sessão/empresa continua limpando todo o cache.
4. **Deduplicação:** carregamentos simultâneos do mesmo lote compartilham RPC e assinatura pelo único QueryClient. A consulta de trabalho não conserva uma segunda cópia do payload após concluir.
5. **Falhas isoladas:** erro de um lote não interrompe os demais; fotos com falha recebem mensagem em vez de permanecer carregando. Atualização da mesma página permite tentar novamente. Renovação também alcança fotos que estavam fora da tela quando o prazo venceu.
6. **DOM estável:** fotos com a mesma URL não são recriadas a cada revalidação.

Nenhuma função, índice, política ou tabela foi alterada nesta etapa de desempenho. RLS, grants, vínculo por empresa, `_version`, RPCs e sinais de INSERT/UPDATE/DELETE foram conferidos. O índice de empresa/ordenação já é usado; não havia evidência para criar outro ou trocar paginação numerada por cursor.

## Limite que permanece

Os arquivos originais ainda são grandes. Para diminuir bytes de cada imagem na primeira visita, o próximo passo técnico é um pipeline de miniaturas derivadas, com referências separadas, versionamento, RLS e migração do legado. Não se deve reduzir/substituir os originais da galeria usados em detalhe e exportação. As correções desta rodada reduzem trabalho repetido e adiam imagens fora da tela, sem alterar os produtos ou a qualidade dos arquivos.

Outros seletores usam `sp_list('products')` para metadados integrais, sem pixels. Esse caminho não é chamado pela lista paginada aqui analisada.

## Evidências e referências

- `artifacts/product-performance-20261102/backend-audit.md`, `backend-metrics.json`, `media-audit.json` e consultas `*-explain.sql/json`.
- Testes de paginação, filtros múltiplos, cache, assinatura/expiração, sessão, ciclo de vida, visibilidade, concorrência e falha de lote.
- Skills Supabase/Postgres e TanStack Query; regras do `AGENTS.md`, `docs/ESTRUTURA.md` e `docs/BANCO.md`.
- [QueryClient — documentação oficial](https://tanstack.com/query/latest/docs/reference/QueryClient).
- [Intersection Observer — MDN](https://developer.mozilla.org/en-US/docs/Web/API/Intersection_Observer_API).

## Validação final

`npm test`: **530 testes, 517 passaram, 13 ignorados, zero falhas**. `npm run build`: aprovado, 249 módulos verificados e 318 arquivos dentro do limite de 500 linhas; `dist/` atualizado. Logs: `/private/tmp/povo-product-performance-tests.log` e `/private/tmp/povo-product-performance-build.log`.

A revisão independente aprovou as correções e a regressão adicional de renovação: fotos carregadas em momentos diferentes agora mantêm seus próprios prazos, em vez de perder o segundo timer quando o primeiro dispara. O botão **Tentar novamente fotos** repete somente as prévias visíveis; falhas de download/decodificação do `<img>` também recebem mensagem.

Esta etapa não contém mudança SQL. A migração anterior dos filtros múltiplos passou por `npm run test:db` e conferência remota registrada em `docs/VALIDACAO-INTEGRACAO.md`. Não houve deploy de frontend remoto nesta etapa; o build local foi atualizado. Não foi medido tempo total em navegador, conforme a preferência do usuário por CLI/MCP.
