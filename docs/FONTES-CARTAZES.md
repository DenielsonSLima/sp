# Fontes gratuitas para cartazes

Seleção adicionada em 02/11/2026. As 20 famílias usam SIL Open Font License 1.1, com licenças originais em `assets/fonts/posters/`. Os arquivos WOFF2 são servidos pelo próprio site, sem consulta ao Google durante o uso. O subconjunto latino inclui acentuação portuguesa, números e símbolos monetários.

As cinco opções anteriores permanecem em “Fontes do sistema” por compatibilidade com modelos existentes. Elas dependem da instalação no dispositivo e não integram este pacote gratuito.

| Fonte | Uso sugerido | Origem e licença |
| --- | --- | --- |
| Anton | Ofertas e preços | [Google Fonts](https://github.com/google/fonts/tree/main/ofl/anton) · [OFL](../assets/fonts/posters/anton-OFL.txt) |
| Bebas Neue | Ofertas e preços | [Google Fonts](https://github.com/google/fonts/tree/main/ofl/bebasneue) · [OFL](../assets/fonts/posters/bebas-neue-OFL.txt) |
| Oswald | Ofertas e preços | [Google Fonts](https://github.com/google/fonts/tree/main/ofl/oswald) · [OFL](../assets/fonts/posters/oswald-OFL.txt) |
| Barlow Condensed | Ofertas e preços | [Google Fonts](https://github.com/google/fonts/tree/main/ofl/barlowcondensed) · [OFL](../assets/fonts/posters/barlow-condensed-OFL.txt) |
| Roboto Condensed | Ofertas e preços | [Google Fonts](https://github.com/google/fonts/tree/main/ofl/robotocondensed) · [OFL](../assets/fonts/posters/roboto-condensed-OFL.txt) |
| Archivo Black | Ofertas e preços | [Google Fonts](https://github.com/google/fonts/tree/main/ofl/archivoblack) · [OFL](../assets/fonts/posters/archivo-black-OFL.txt) |
| Alfa Slab One | Chamadas especiais | [Google Fonts](https://github.com/google/fonts/tree/main/ofl/alfaslabone) · [OFL](../assets/fonts/posters/alfa-slab-one-OFL.txt) |
| Bungee | Chamadas especiais | [Google Fonts](https://github.com/google/fonts/tree/main/ofl/bungee) · [OFL](../assets/fonts/posters/bungee-OFL.txt) |
| Lilita One | Chamadas especiais | [Google Fonts](https://github.com/google/fonts/tree/main/ofl/lilitaone) · [OFL](../assets/fonts/posters/lilita-one-OFL.txt) |
| Paytone One | Chamadas especiais | [Google Fonts](https://github.com/google/fonts/tree/main/ofl/paytoneone) · [OFL](../assets/fonts/posters/paytone-one-OFL.txt) |
| Passion One | Ofertas e preços | [Google Fonts](https://github.com/google/fonts/tree/main/ofl/passionone) · [OFL](../assets/fonts/posters/passion-one-OFL.txt) |
| Fugaz One | Chamadas especiais | [Google Fonts](https://github.com/google/fonts/tree/main/ofl/fugazone) · [OFL](../assets/fonts/posters/fugaz-one-OFL.txt) |
| Righteous | Chamadas especiais | [Google Fonts](https://github.com/google/fonts/tree/main/ofl/righteous) · [OFL](../assets/fonts/posters/righteous-OFL.txt) |
| Staatliches | Ofertas e preços | [Google Fonts](https://github.com/google/fonts/tree/main/ofl/staatliches) · [OFL](../assets/fonts/posters/staatliches-OFL.txt) |
| Montserrat | Produtos e informações | [Google Fonts](https://github.com/google/fonts/tree/main/ofl/montserrat) · [OFL](../assets/fonts/posters/montserrat-OFL.txt) |
| Poppins | Produtos e informações | [Google Fonts](https://github.com/google/fonts/tree/main/ofl/poppins) · [OFL](../assets/fonts/posters/poppins-OFL.txt) |
| Nunito Sans | Produtos e informações | [Google Fonts](https://github.com/google/fonts/tree/main/ofl/nunitosans) · [OFL](../assets/fonts/posters/nunito-sans-OFL.txt) |
| Rubik | Produtos e informações | [Google Fonts](https://github.com/google/fonts/tree/main/ofl/rubik) · [OFL](../assets/fonts/posters/rubik-OFL.txt) |
| Lato | Produtos e informações | [Google Fonts](https://github.com/google/fonts/tree/main/ofl/lato) · [OFL](../assets/fonts/posters/lato-OFL.txt) |
| Barlow | Produtos e informações | [Google Fonts](https://github.com/google/fonts/tree/main/ofl/barlow) · [OFL](../assets/fonts/posters/barlow-OFL.txt) |

Para começar: Anton ou Archivo Black para preços; Bebas Neue ou Oswald para chamadas; Montserrat ou Barlow para produtos e informações. Ajuste o tamanho e a caixa no editor após trocar a fonte.

O seletor agrupa as famílias por finalidade e mantém a busca existente. O PDF carrega os pesos 700 e 900 utilizados antes de medir e desenhar o texto, e informa falha de carregamento em vez de exportar uma fonte substituta. Famílias com um único peso usam a síntese de negrito do navegador, tanto na prévia quanto no Canvas.

O manifesto `assets/fonts/posters/catalog.json` registra URLs de origem e SHA-256 de cada arquivo. O script `scripts/download-poster-fonts.mjs` permite renovar os recursos explicitamente; não roda no build. Após renovar, conferir licenças, visual e hashes.

Validação local: `npm test` (501 aprovados, 13 ignorados), `npm run build` e `npm run test:db` (12 suítes). O teste de banco cobre gravação e leitura das 25 opções pelas RPCs, rejeição de fontes inválidas, geometria, concorrência, isolamento de empresa, grants privados e sinal Realtime.

Validação remota: migração `20261102030842_poster_free_fonts` aplicada ao projeto `enhoierfwuwtzulznjxa` por CLI oficial 2.108.0, usando `db query --linked` com DDL e registro em `supabase_migrations.schema_migrations` na mesma transação. A conexão direta de `db push --dry-run` falhou na autenticação da role temporária; a transação alternativa conferiu o hash do validador antes de alterá-lo e impediu aplicação duplicada. As 20 novas fontes foram aceitas; MD5 do statement remoto e arquivo local: `83005f44b7f1b7d07bf2e9abb9660244`. Os três modelos mantiveram hash `3f7fed73c362156fc38a9c4169722a01`, versões, RLS, política, trigger, publicação Realtime e grants. Evidências em `artifacts/fontes-20261102/`. Nenhum modelo real foi gravado para testar. Build local atualizado em `dist/`; nenhuma publicação externa de frontend foi executada.
