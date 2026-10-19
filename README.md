# Supermercado do Povo

Protótipo modular em português, independente de outros projetos.

## Executar

Com Node.js e Python 3 disponíveis:

- `npm test`: testes do adaptador de dados e escape de conteúdo.
- `npm run build`: prepara o site estático em `dist/`.
- `npm start`: serve a pasta do projeto em http://localhost:4173.

O acesso "Entrar na demonstração" não autentica. Não use dados pessoais, senhas nem informações reais. Os produtos são fictícios e as inclusões ficam apenas em memória, perdidas ao recarregar. O botão de saída encerra a navegação de demonstração, sem prometer autenticação.

## Estrutura

- `login/`: interface e lógica de entrada demonstrativa.
- `interno/shell.js` e `shell.css`: navegação e estrutura da área interna.
- `interno/inicio/`: painel inicial.
- `interno/cadastros/`: grupo expansível no menu, sem tela própria. `parceiros/` e `produtos/` têm arquivos e rotas independentes, com busca e inclusão fictícia.
- `interno/cotacao/`: módulo reservado, regras ainda a definir.
- `interno/hortifruti/`: fluxo preliminar de compra da feira, pesagem/preço e conferência de custo. Nenhuma fórmula definida sem confirmar unidades e regras.
- `interno/acougue/`: módulo inicial reservado, sem regras comerciais presumidas.
- `interno/encartes/`: estado inicial e ilustração de layout, sem geração/exportação/publicação.
- `interno/promocoes/`: estado inicial de promoções, sem alteração de preços nem regras comerciais presumidas.
- `interno/modules.js`: registro central e resolução segura das rotas e grupo de cadastros.
- `interno/configuracoes/`: cards e rotas próprias de Empresa, Usuários, Perfis, Marca d’água e Cabeçalho. Cada submódulo tem pasta própria com interface, estilo e lógica. Formulários usam somente memória; perfis não aplicam segurança, usuários não criam contas, marca d’água e cabeçalho são apenas prévias sem exportação. Imagem de marca d’água é lida localmente, sem upload.
- `shared/repository.js`: contrato assíncrono e adaptador em memória. Futuro adaptador Supabase deve respeitar o contrato, implementar autenticação/autorização/RLS e validar regras antes de dados reais.
- `assets/`: logomarca original fornecida, sem alteração do arquivo.
- `tests/`: testes unitários e roteiro de QA no navegador.

Sem dependências de execução, chamadas de banco, chaves, APIs externas ou rastreadores. Publicação privada usa o controle de acesso do provedor; a interface de login continua demonstrativa.

## Próximas definições

Confirmar unidades de compra do Hortifruti e método de custo antes de implementar entrada/cálculo. Definir regras da Cotação e cadastros adicionais. Integrar banco de dados e autenticação somente na etapa posterior.
