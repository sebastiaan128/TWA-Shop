import ping from './ping.mjs';
import role from './role.mjs';
import review from './review.mjs';
import sub from './sub.mjs';
import subAdd from './sub-add.mjs';
import subRemove from './sub-remove.mjs';

export const registerCommands = [ping.data, role.data, review.data, sub.data, subAdd.data, subRemove.data];
export const registerCommandsMap = new Map([
  [ping.data.name, ping],
  [role.data.name, role],
  [review.data.name, review],
  [sub.data.name, sub],
  [subAdd.data.name, subAdd],
  [subRemove.data.name, subRemove],
]);
