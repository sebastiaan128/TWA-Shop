import ping from './ping.mjs';
import role from './role.mjs';

export const registerCommands = [ping.data, role.data];
export const registerCommandsMap = new Map([
  [ping.data.name, ping],
  [role.data.name, role]
]);

