/**
 * The modules that consult the hub in this world.
 *
 * Modules call `api.register(moduleId)` from their own `ready` hook. The hub
 * uses the list to name, on its card, what is licensed and what is still on
 * trial — and to stay quiet altogether in a world where nothing registered is
 * left on trial.
 *
 * Registered is not the same as licensed: a $3 patron's world registers every
 * module, while the licence covers only velvet-mobile (see world.js).
 */

const registered = new Set();

/**
 * @param {string} moduleId  The caller's own id, exactly as in its manifest.
 * @returns {boolean} Whether the module was accepted.
 */
export function register(moduleId) {
  if ( typeof moduleId !== "string" ) return false;
  // Only modules that are really running here: the card shows this list to the
  // GM, so it must not name anything that is not.
  if ( !game.modules.get(moduleId)?.active ) return false;
  registered.add(moduleId);
  return true;
}

/** @returns {{id: string, title: string}[]} Sorted by title. */
export function registeredModules() {
  return [...registered]
    .map(id => ({ id, title: game.modules.get(id)?.title ?? id }))
    .sort((a, b) => a.title.localeCompare(b.title));
}
