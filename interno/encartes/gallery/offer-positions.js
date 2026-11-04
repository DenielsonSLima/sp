import { positions1 } from './positions/acougue-cuidados-1.js';
import { positions2 } from './positions/acougue-cuidados-2.js';
import { positions3 } from './positions/acougue-cuidados-3.js';
import { positions4 } from './positions/acougue-cuidados-4.js';
import { positions5 } from './positions/acougue-cuidados-5.js';
import { positions6 } from './positions/alimentos-1.js';
import { positions7 } from './positions/alimentos-2.js';
import { positions8 } from './positions/alimentos-3.js';
import { positions9 } from './positions/alimentos-4.js';
import { positions10 } from './positions/alimentos-5.js';
import { comboPositions } from './positions/combos.js';

export const sceneOfferPositions = {
  ...positions1,
  ...positions2,
  ...positions3,
  ...positions4,
  ...positions5,
  ...positions6,
  ...positions7,
  ...positions8,
  ...positions9,
  ...positions10,
  ...comboPositions,
};
