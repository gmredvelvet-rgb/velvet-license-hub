/**
 * The world's licence, as every client sees it.
 *
 * One setting, `worldLicence = { until, modules }`:
 *
 *   until    Epoch ms. The verdict holds until then. GM browsers holding valid
 *            credentials push it forward (license.js → publishWorldLicence);
 *            nobody ever has to switch it off, it simply lapses.
 *   modules  The ids the verdict covers, as the licence server reported them.
 *            A $3 patron is licensed for velvet-mobile and nothing else, so a
 *            date alone could not say what is licensed.
 *
 * One object rather than two settings so that a write is atomic: a client never
 * sees a fresh date paired with a stale list, and every change broadcasts once.
 *
 * It is the only piece of licence state that leaves the GM's browser. World
 * settings reach every player, so this must never hold a token.
 */

import { MODULE_ID } from "./constants.js";

export const SETTING = "worldLicence";

/** @returns {{until: number, modules: string[]}} */
export function worldLicence() {
  try {
    const value = game.settings.get(MODULE_ID, SETTING) ?? {};
    return {
      until: Number(value.until) || 0,
      modules: Array.isArray(value.modules) ? value.modules.filter(m => typeof m === "string") : []
    };
  }
  catch ( err ) {
    return { until: 0, modules: [] };
  }
}

/** @returns {number} Epoch ms until which this world is licensed; 0 if never. */
export function worldLicensedUntil() {
  return worldLicence().until;
}

/**
 * @param {string} [moduleId]  Omitted: whether any verdict is in force.
 * @returns {boolean}
 */
export function isWorldLicensed(moduleId) {
  const { until, modules } = worldLicence();
  if ( until <= Date.now() ) return false;
  return moduleId === undefined ? modules.length > 0 : modules.includes(moduleId);
}

/**
 * Whether the hub has ever licensed this world (and not been released since).
 *
 * The switch covered modules use to decide who has the last word: until the hub
 * has spoken, a module's own older `worldLicensed` flag still counts, so nobody
 * who already paid loses access by updating. Once it has, the hub alone decides.
 * @returns {boolean}
 */
export function hasVerdict() {
  return worldLicensedUntil() > 0;
}
