/**
 * The modules that consult the hub in this world.
 *
 * Covered modules call `api.register(moduleId)` from their own `ready` hook.
 * The hub uses the list for two things: naming what the licence covers on its
 * card, and staying quiet altogether in a world where no covered module is
 * active — there is no trial there to remind anyone of.
 */

const covered = new Set();

/**
 * @param {string} moduleId  The caller's own id, exactly as in its manifest.
 * @returns {boolean} Whether the module was accepted.
 */
export function register(moduleId) {
  if ( typeof moduleId !== "string" ) return false;
  // Only modules that are really running here: the list is shown to the GM as
  // "what this licence covers", so it must not name anything that is not.
  if ( !game.modules.get(moduleId)?.active ) return false;
  covered.add(moduleId);
  return true;
}

/** @returns {{id: string, title: string}[]} Sorted by title. */
export function coveredModules() {
  return [...covered]
    .map(id => ({ id, title: game.modules.get(id)?.title ?? id }))
    .sort((a, b) => a.title.localeCompare(b.title));
}
