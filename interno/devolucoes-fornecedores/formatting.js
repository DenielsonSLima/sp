export const settlementMethods = {
  pix: 'Pix',
  dinheiro: 'Dinheiro',
  transferencia: 'Transferência',
  credito: 'Crédito com fornecedor',
  abatimento: 'Abatimento em compra',
  outro: 'Outro',
};
export const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
export const money = (cents) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
export const totals = (record) => {
  if (!record?.computed?.totals) throw Error('O banco não retornou os totais da devolução. Recarregue o registro.');
  return record.computed.totals;
};
