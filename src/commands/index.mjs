import ping from './ping.mjs';
import role from './role.mjs';
import review from './review.mjs';
import sub from './sub.mjs';
import subAdd from './sub-add.mjs';
import subRemove from './sub-remove.mjs';
import eod from './eod.mjs';
import eodTest from './eod-test.mjs';
import eodYesterdayTest from './eod-yesterday-test.mjs';
import eodDebug from './eod-debug.mjs';

export const registerCommands = [ping.data, role.data, review.data, sub.data, subAdd.data, subRemove.data, eod.data, eodTest.data, eodYesterdayTest.data, eodDebug.data];
export const registerCommandsMap = new Map([
  [ping.data.name, ping],
  [role.data.name, role],
  [review.data.name, review],
  [sub.data.name, sub],
  [subAdd.data.name, subAdd],
  [subRemove.data.name, subRemove],
  [eod.data.name, eod],
  [eodTest.data.name, eodTest],
  [eodYesterdayTest.data.name, eodYesterdayTest],
  [eodDebug.data.name, eodDebug],
]);
