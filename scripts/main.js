/**
 * Velvet License Hub — entry point.
 *
 * One Patreon connection that licenses every module consulting the hub, in
 * every world opened from the same browser. Covered modules look the hub up
 * in their own `ready` hook; when it is active they register with it and stay
 * silent, and the hub shows the one card — if any card is needed at all.
 *
 * Public API, at `game.modules.get("velvet-license-hub").api`:
 *
 *   apiVersion          2. Consumers require the version they need (`>= 1` to
 *                       register, `>= 2` for the rest) and treat anything else
 *                       as "no hub", falling back to their own licence.
 *   register(id)        v1. Declare that module `id` consults the hub here.
 *                       Call from `ready`, ideally before any `await`; a later
 *                       call still gets the module into the card and reminder.
 *   openLicenseCard()   v1. Show the hub's card, e.g. from a module's own menu.
 *   isLicensed(id?)     With an id: whether the verdict covers that module. With
 *                       none: whether any verdict is in force (the v1 meaning).
 *   hasVerdict()        v2. Whether the hub has ever licensed this world. Until
 *                       it has, a module's own older flag still counts.
 *   request(m, path, b) v2. Authenticated call to the licence server, GM only.
 *
 * Everything is wrapped in try/catch: the soft gate's golden rule is that no
 * feature is ever blocked, and that includes a failure in the licence layer
 * itself taking a module down with it.
 */

import { MODULE_ID, MODULE_TITLE } from "./constants.js";
import LicenseClient from "./license.js";
import LicenseUI, { licenseMenuClass, openLicenseCard } from "./license-ui.js";
import { SETTING, isWorldLicensed, hasVerdict } from "./world.js";
import { register } from "./registry.js";

/** Set once the hub's own ready pass has decided what to show. */
let settled = false;

/**
 * `register` as the API exposes it. A module that registers after the hub's
 * ready pass — because it awaited something first — would otherwise never be
 * reminded about: the reminder is only scheduled when something is on trial,
 * and at that point it was not there yet.
 * @param {string} moduleId
 * @returns {boolean}
 */
function registerModule(moduleId) {
  const accepted = register(moduleId);
  if ( accepted && settled ) {
    try {
      LicenseUI.startReminder();
      if ( game.user?.isGM && !LicenseClient.instance.hasStoredCredentials ) LicenseUI.show();
    }
    catch ( error ) {
      console.error(`${MODULE_TITLE} | Late registration of ${moduleId} failed`, error);
    }
  }
  return accepted;
}

Hooks.once("init", () => {
  try {
    game.settings.register(MODULE_ID, SETTING, {
      scope: "world", config: false, type: Object, default: { until: 0, modules: [] }
    });
    game.settings.registerMenu(MODULE_ID, "licenseMenu", {
      name:  `${MODULE_ID}.Settings.License.Name`,
      label: `${MODULE_ID}.Settings.License.Label`,
      hint:  `${MODULE_ID}.Settings.License.Hint`,
      icon:  "fa-brands fa-patreon",
      type:  licenseMenuClass(),
      restricted: true
    });
    // Published in init so it exists before any module's `ready` hook runs.
    game.modules.get(MODULE_ID).api = Object.freeze({
      apiVersion: 2,
      register: registerModule,
      openLicenseCard,
      isLicensed: isWorldLicensed,
      hasVerdict,
      request: (method, path, body) => LicenseClient.instance.request(method, path, body)
    });
  }
  catch ( error ) {
    // Without the API every covered module falls back to its own licence
    // flow — a noisier table, but never a silent one.
    console.error(`${MODULE_TITLE} | Initialisation failed`, error);
  }
});

Hooks.once("ready", async () => {
  // Foundry also loads modules on join, setup and stream, where there is no
  // world to license and no GM to ask.
  if ( game.view !== "game" ) return;
  // Covered modules register from their own ready hooks. Let all of them run
  // before deciding whether there is anything to show.
  await new Promise(resolve => setTimeout(resolve, 0));
  try {
    if ( game.user?.isGM ) {
      const client = LicenseClient.instance;
      const licensed = await client.initialize();
      // Same browser, another world: the credentials are already here, so the
      // world is licensed on the spot — no card, no second connection.
      if ( licensed ) await client.publishWorldLicence();
      // Without credentials there is nobody to renew the verdict from here, so a
      // module still on trial gets the card now. With them, the reminder is
      // enough — it is the $3 case, and that GM has already connected.
      if ( !client.hasStoredCredentials && LicenseUI.hasTrialModules() ) LicenseUI.show();
    }
    // Players only ever read the world's verdict; they never contact the server.
    LicenseUI.startReminder();
  }
  catch ( error ) {
    console.error(`${MODULE_TITLE} | Licence check failed`, error);
  }
  finally {
    settled = true;
  }
});

// Activating mid-session silences the reminder on every client, no reload.
Hooks.on("updateSetting", setting => {
  if ( setting.key !== `${MODULE_ID}.${SETTING}` ) return;
  if ( LicenseUI.hasTrialModules() ) LicenseUI.startReminder();
  else LicenseUI.stopReminder();
});
