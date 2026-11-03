import { localDate } from './services.js';
import { clearOnContextChange } from '../cadastros/remote.js';
export const blankDraft = () => ({
  category: '',
  weight: '',
  reference: '',
  notes: '',
  purchaseTotal: '',
  receivedDate: localDate(),
  quantities: {},
  animalCount: '1',
  weightMode: 'total',
  animals: [{ identification: '', weight: '' }],
  sections: [],
});
export const state = { draft: blankDraft(), filters: { query: '', start: '', end: '', page: 1 }, listMessage: '' };
clearOnContextChange('butcher_receipts', () => {
  state.draft = blankDraft();
  state.filters = { query: '', start: '', end: '', page: 1 };
  state.listMessage = '';
});
