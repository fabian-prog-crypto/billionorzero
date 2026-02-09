import { ActionHandler } from '../types';
import { updateCashHandler } from './update-cash.handler';
import { addCashHandler } from './add-cash.handler';
import { buyHandler } from './buy.handler';
import { sellPartialHandler } from './sell-partial.handler';
import { sellAllHandler } from './sell-all.handler';
import { removeHandler } from './remove.handler';
import { setPriceHandler } from './set-price.handler';
import { updatePositionHandler } from './update-position.handler';

export const ALL_HANDLERS: ActionHandler[] = [
  updateCashHandler,
  addCashHandler,
  buyHandler,
  sellPartialHandler,
  sellAllHandler,
  removeHandler,
  setPriceHandler,
  updatePositionHandler,
];
