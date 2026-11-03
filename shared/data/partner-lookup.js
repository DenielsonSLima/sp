// Read-only public registration lookup. Only the requested CNPJ leaves the application.
const value = (input) => (typeof input === 'string' || typeof input === 'number' ? String(input).trim() : '');
const compact = (input) =>
  value(input)
    .toUpperCase()
    .replace(/[./\s-]/g, '');
export function partnerFromRegistry(data, provider, cnpj) {
  const record = provider === 'CNPJ.ws' ? data?.estabelecimento : data;
  if (!record || compact(record.cnpj) !== cnpj || !value(data.razao_social))
    throw Error('A consulta retornou dados incompatíveis com o CNPJ informado.');
  const tradeName = value(record.nome_fantasia),
    legalName = value(data.razao_social),
    street = value(record.logradouro),
    streetType = value(record.tipo_logradouro ?? record.descricao_tipo_de_logradouro);
  return {
    cnpj,
    name: (tradeName || legalName).slice(0, 100),
    tradeName: tradeName.slice(0, 100),
    legalName,
    email: value(record.email),
    phone: provider === 'CNPJ.ws' ? value(record.ddd1) + value(record.telefone1) : value(record.ddd_telefone1),
    street:
      streetType && !street.toUpperCase().startsWith(streetType.toUpperCase() + ' ')
        ? `${streetType} ${street}`.trim()
        : street,
    number: value(record.numero),
    complement: value(record.complemento),
    district: value(record.bairro),
    city: provider === 'CNPJ.ws' ? value(record.cidade?.nome) : value(record.municipio),
    state: provider === 'CNPJ.ws' ? value(record.estado?.sigla) : value(record.uf),
    postalCode: value(record.cep).replace(/[\s-]/g, ''),
  };
}
export async function fetchPartnerCnpj(cnpj, { fetcher = globalThis.fetch, signal } = {}) {
  const providers = [
    ['BrasilAPI', `https://brasilapi.com.br/api/cnpj/v1/${encodeURIComponent(cnpj)}`],
    ['CNPJ.ws', `https://publica.cnpj.ws/cnpj/${encodeURIComponent(cnpj)}`],
  ];
  let notFound = false,
    limited = false;
  for (const [provider, url] of providers) {
    if (signal?.aborted) throw Error('Consulta cancelada.');
    try {
      const timeout = AbortSignal.timeout(10_000),
        requestSignal = signal ? AbortSignal.any([signal, timeout]) : timeout;
      const response = await fetcher(url, {
        signal: requestSignal,
        credentials: 'omit',
        headers: { Accept: 'application/json' },
        referrerPolicy: 'no-referrer',
      });
      if (response.status === 404) {
        notFound = true;
        continue;
      }
      if (response.status === 429) {
        limited = true;
        continue;
      }
      if (!response.ok) continue;
      const record = partnerFromRegistry(await response.json(), provider, cnpj);
      return { record, provider, consultedAt: new Date().toISOString() };
    } catch (error) {
      if (signal?.aborted) throw Error('Consulta cancelada.');
    }
  }
  throw Error(
    limited
      ? 'O serviço gratuito atingiu o limite de consultas. Aguarde um minuto ou preencha os dados manualmente.'
      : notFound
        ? 'CNPJ não encontrado nas bases gratuitas. Confira o documento ou preencha os dados manualmente.'
        : 'A consulta de CNPJ está indisponível no momento. Tente novamente ou preencha os dados manualmente.',
  );
}
