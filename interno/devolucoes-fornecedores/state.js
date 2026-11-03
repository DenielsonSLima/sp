import { runReturnCommand, resetReturnService } from './services.js';
import { queryReturns, getReturn } from './queries.js';
export { loadReturns } from './queries.js';
export * from './formatting.js';
export const returnRepository = {
  list: queryReturns,
  get: getReturn,
  create: (input) => runReturnCommand('create', null, input),
  settle: (id, input) => runReturnCommand('settle', id, input),
  reset: resetReturnService,
};
