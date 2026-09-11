/**
 * The world's licence, as every client sees it.
 *
 * A date rather than a boolean: the world is licensed while `licensedUntil`
 * lies in the future. GM browsers holding valid credentials push it forward
 * (license.js → publishWorldLicence); nobody ever has to switch it off, it
 * simply lapses when no one renews it.
 *
 * It is the only piece of licence state that leaves the GM's browser. World
 * settings reach every player, so this must never hold a token.
 */

import { MODULE_ID } from "./constants.js";

export const SETTING = "licensedUntil";

/** @returns {number} Epoch ms until which this world is licensed; 0 if never. */
export function worldLicensedUntil() {
  try {
    return Number(game.settings.get(MODULE_ID, SETTING)) || 0;
  }
  catch ( err ) {
    return 0;
  }
}

/** @returns {boolean} */
export function isWorldLicensed() {
  return worldLicensedUntil() > Date.now();
}
