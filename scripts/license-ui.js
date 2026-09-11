/**
 * Velvet License Hub — the licence card and the free-trial reminder.
 *
 * One card for every registered module, instead of one per module. It names
 * what the licence covers in this world and what is still on trial, and it
 * never nags where nothing is on trial.
 *
 * The card is a floating element rather than a DialogV2 because a dialog
 * closes the moment any button is pressed, so starting the Patreon flow would
 * tear down the very UI holding the "I have a code" fallback — leaving nowhere
 * to paste the code the popup just produced.
 */

import { MODULE_ID, MODULE_TITLE } from "./constants.js";
import LicenseClient, { L } from "./license.js";
import { isWorldLicensed, worldLicensedUntil } from "./world.js";
import { registeredModules } from "./registry.js";

/** Single card at a time. */
const CARD_ID = `${MODULE_ID}-card`;

/** How often the trial reminder reappears, and how long it lingers. */
const REMINDER_MS = 5 * 60 * 1000;
const AUTO_HIDE_MS = 30 * 1000;

/**
 * Module titles come from other packages' manifests, and codes and errors from
 * a popup and a server: none of it is ours to trust as markup. Local on
 * purpose — falling back to the raw string when a core helper is missing
 * would fail open.
 * @param {unknown} value
 * @returns {string}
 */
function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export default class LicenseUI {
  /** @type {number|null} */
  static #reminderTimer = null;

  /** @type {number|null} */
  static #hideTimer = null;

  /**
   * Registered modules split by the world's verdict.
   * @returns {{covered: object[], trial: object[]}}
   */
  static #split() {
    const modules = registeredModules();
    return {
      covered: modules.filter(m => isWorldLicensed(m.id)),
      trial: modules.filter(m => !isWorldLicensed(m.id))
    };
  }

  /** @returns {boolean} Whether any registered module is still on trial. */
  static hasTrialModules() {
    return LicenseUI.#split().trial.length > 0;
  }

  /**
   * Show the licence card. Idempotent — calling it again leaves the existing
   * card alone rather than stacking a second one.
   * @param {object} [options]
   * @param {boolean} [options.autoHide]  Dismiss itself after AUTO_HIDE_MS.
   * @param {boolean} [options.force]     Show even with nothing on trial (an
   *                                      explicit request from a menu).
   */
  static show({ autoHide = false, force = false } = {}) {
    if ( document.getElementById(CARD_ID) ) return;
    const { covered, trial } = LicenseUI.#split();
    if ( !trial.length && !force ) return;

    // With nothing registered (a forced open), the world-wide verdict decides.
    const onTrial = trial.length > 0 || (!covered.length && !isWorldLicensed());
    // Only the GM can act on an unlicensed world, so only their card offers
    // the Patreon flow; players get the same notice with nothing to press.
    let markup;
    if ( !onTrial ) markup = LicenseUI.#activeMarkup(covered);
    else if ( game.user?.isGM ) markup = LicenseUI.#trialMarkupGM(trial, covered);
    else markup = LicenseUI.#trialMarkupPlayer(trial);

    const card = document.createElement("div");
    card.id = CARD_ID;
    card.className = `vlh-license-card ${onTrial ? "is-trial" : "is-active"}`;
    card.innerHTML = markup;

    card.addEventListener("click", event => {
      LicenseUI.#cancelAutoHide();
      const action = event.target.closest("button")?.dataset.action;
      if ( action ) LicenseUI.#onAction(action, card);
    });
    // Reading the card should not make it vanish mid-sentence.
    card.addEventListener("pointerenter", () => LicenseUI.#cancelAutoHide());

    document.body.append(card);
    if ( autoHide ) {
      LicenseUI.#hideTimer = setTimeout(() => {
        LicenseUI.#hideTimer = null;
        card.remove();
      }, AUTO_HIDE_MS);
    }
  }

  /** Remove the card, if one is open. */
  static hide() {
    LicenseUI.#cancelAutoHide();
    document.getElementById(CARD_ID)?.remove();
  }

  /* -------------------------------------------- */
  /*  Trial reminder                              */
  /* -------------------------------------------- */

  /**
   * Start the periodic free-trial reminder. Safe to call repeatedly: it
   * restarts a single timer. The verdict is re-read on every tick, so
   * activating mid-session silences it without a reload.
   */
  static startReminder() {
    LicenseUI.#clearTimer();
    if ( !LicenseUI.hasTrialModules() ) return;
    LicenseUI.#reminderTimer = setInterval(() => {
      if ( !LicenseUI.hasTrialModules() ) return void LicenseUI.stopReminder();
      LicenseUI.show({ autoHide: true });
    }, REMINDER_MS);
  }

  /** Stop the reminder and clear any trial card it left behind. */
  static stopReminder() {
    LicenseUI.#clearTimer();
    const card = document.getElementById(CARD_ID);
    if ( card?.classList.contains("is-trial") ) LicenseUI.hide();
  }

  static #clearTimer() {
    if ( LicenseUI.#reminderTimer ) clearInterval(LicenseUI.#reminderTimer);
    LicenseUI.#reminderTimer = null;
  }

  static #cancelAutoHide() {
    if ( LicenseUI.#hideTimer ) clearTimeout(LicenseUI.#hideTimer);
    LicenseUI.#hideTimer = null;
  }

  /* -------------------------------------------- */
  /*  Markup                                      */
  /* -------------------------------------------- */

  static #header(badge = "") {
    return `
      <header>
        <i class="fa-solid fa-key" aria-hidden="true"></i>
        <strong>${MODULE_TITLE}</strong>
        ${badge ? `<span class="vlh-license-badge">${badge}</span>` : ""}
      </header>`;
  }

  /** @param {{title: string}[]} modules */
  static #moduleList(modules) {
    if ( !modules.length ) return `<p class="vlh-license-note">${L("NoModules")}</p>`;
    const items = modules.map(m => `<li>${escapeHtml(m.title)}</li>`).join("");
    return `<ul class="vlh-license-modules">${items}</ul>`;
  }

  /**
   * @param {object[]} trial    Registered modules the verdict does not cover.
   * @param {object[]} covered  Registered modules it does — non-empty only when
   *   the tier opens part of the catalogue ($3 opens velvet-mobile alone). That
   *   GM has already connected; what they need to hear is that their tier stops
   *   short, and that reconnecting after an upgrade applies it at once.
   */
  static #trialMarkupGM(trial, covered = []) {
    const partial = covered.length > 0;
    return `
      ${LicenseUI.#header(L("TrialBadge"))}
      <p class="vlh-license-status">${L(partial ? "TrialPartial" : "TrialIntro")}</p>
      ${LicenseUI.#moduleList(trial)}
      <p class="vlh-license-note">${L(partial ? "TrialPitchUpgrade" : "TrialPitch")}</p>
      <button type="button" data-action="connect" class="vlh-license-primary">
        <i class="fa-brands fa-patreon" aria-hidden="true"></i> ${L("Connect")}
      </button>
      <button type="button" data-action="code">${L("HaveCode")}</button>
      <button type="button" data-action="dismiss" class="vlh-license-dismiss">${L("Later")}</button>`;
  }

  /**
   * Players are never the customer — the subscription is the GM's alone. This
   * variant says whose trial it is and gets out of the way: no call to action,
   * and nothing asking them to go pester the GM about it.
   */
  static #trialMarkupPlayer(modules) {
    return `
      ${LicenseUI.#header(L("TrialBadge"))}
      <p class="vlh-license-status">${L("TrialIntroPlayer")}</p>
      ${LicenseUI.#moduleList(modules)}
      <p class="vlh-license-note">${L("TrialPlayerNote")}</p>
      <button type="button" data-action="dismiss" class="vlh-license-dismiss">${L("Close")}</button>`;
  }

  static #activeMarkup(modules) {
    const client = LicenseClient.instance;
    // Inside the trust window this browser may hold no live token at all —
    // say the licence is verified rather than claim a tier we cannot read.
    const tier = client.tier;
    const status = (tier === "none") ? L("StatusTrusted") : L("StatusActive", { tier });
    const date = new Date(worldLicensedUntil()).toLocaleDateString(game.i18n.lang);
    // Releasing needs this browser's own credentials; a GM on another device
    // would only get an authorisation error out of the button.
    const release = client.hasStoredCredentials
      ? `<p class="vlh-license-note">${L("ReleaseHint")}</p>
         <button type="button" data-action="release">${L("Release")}</button>`
      : "";
    return `
      ${LicenseUI.#header()}
      <p class="vlh-license-status">${status}</p>
      ${LicenseUI.#moduleList(modules)}
      <p class="vlh-license-note">${L("ValidUntil", { date: escapeHtml(date) })}</p>
      ${release}
      <button type="button" data-action="dismiss" class="vlh-license-dismiss">${L("Close")}</button>`;
  }

  /* -------------------------------------------- */
  /*  Actions                                     */
  /* -------------------------------------------- */

  /** @param {string} action @param {HTMLElement} card */
  static async #onAction(action, card) {
    switch ( action ) {
      case "connect": return void LicenseUI.#connect(card);
      case "code": return void LicenseUI.#enterCode(card);
      case "release": return void LicenseUI.#release(card);
      case "dismiss": return void card.remove();
      default: return undefined;
    }
  }

  /**
   * Run the Patreon flow. The card stays put throughout, so a blocked popup
   * or a rejected exchange still leaves the code route one tap away.
   * @param {HTMLElement} card
   */
  static async #connect(card) {
    const button = card.querySelector('[data-action="connect"]');
    const original = button.innerHTML;
    button.disabled = true;
    button.textContent = L("Opening");

    try {
      const connected = await LicenseClient.instance.startOAuth();
      if ( connected ) {
        LicenseUI.stopReminder();
        return void card.remove();
      }
      ui.notifications?.info(`${MODULE_TITLE}: ${L("Cancelled")}`);
    }
    catch ( err ) {
      console.error(`${MODULE_TITLE} | Patreon authorisation failed`, err);
      ui.notifications?.error(`${MODULE_TITLE}: ${err.message}`);
      // The code is single-use and short-lived: offer it straight back rather
      // than making the user repeat the whole round trip.
      if ( err.authCode ) return void LicenseUI.#enterCode(card, err.authCode, err.message);
    }
    finally {
      if ( document.body.contains(card) ) {
        button.disabled = false;
        button.innerHTML = original;
      }
    }
  }

  /**
   * Manual code entry: the fallback for blocked popups and the retry path
   * for a rejected exchange.
   * @param {HTMLElement} card
   * @param {string} [prefill]
   * @param {string} [error]
   */
  static async #enterCode(card, prefill = "", error = "") {
    const notice = error
      ? `<p style="color:var(--color-level-error, #d05); margin-bottom:.5rem">${escapeHtml(error)}</p>`
      : "";

    const code = await foundry.applications.api.DialogV2.prompt({
      window: { title: `${MODULE_TITLE} — ${L("CodeTitle")}` },
      content: `${notice}
        <p style="margin-bottom:.5rem">${L("CodeHint")}</p>
        <input type="text" name="code" autocomplete="off" spellcheck="false" value="${escapeHtml(prefill)}"
               style="width:100%;font-family:monospace;font-size:16px">`,
      ok: {
        label: L("Activate"),
        icon: "fa-solid fa-key",
        callback: (event, button) => button.form?.elements.code?.value?.trim()
      },
      rejectClose: false
    });
    if ( !code ) return;

    try {
      await LicenseClient.instance.activateWithCode(code);
      LicenseUI.stopReminder();
      card.remove();
    }
    catch ( err ) {
      console.error(`${MODULE_TITLE} | Activation failed`, err);
      ui.notifications?.error(`${MODULE_TITLE}: ${err.message}`);
    }
  }

  /** @param {HTMLElement} card */
  static async #release(card) {
    const confirmed = await foundry.applications.api.DialogV2.confirm({
      window: { title: `${MODULE_TITLE} — ${L("Release")}` },
      content: `<p>${L("ReleaseConfirm")}</p>`,
      rejectClose: false
    });
    if ( !confirmed ) return;
    if ( await LicenseClient.instance.releaseInstallation() ) {
      card.remove();
      LicenseUI.startReminder();
      LicenseUI.show({ force: true });
    }
  }
}

/**
 * Open the card on an explicit request — the settings menu, or a covered
 * module's API call. Replaces whatever is on screen, and shows even in a world
 * with no covered module active yet.
 */
export function openLicenseCard() {
  LicenseUI.hide();
  LicenseUI.show({ force: true });
}

/**
 * Settings-menu entry point, built on demand rather than at import time.
 *
 * Extending `foundry.applications.api.ApplicationV2` at module scope would
 * evaluate that path while the file loads: if a future release moves or
 * renames it, the whole module would fail to import — a total outage caused
 * by a settings button. Resolving it inside a function defers the lookup to
 * `init`, when the API is present.
 *
 * `registerMenu` only ever constructs the class and calls `render()`.
 * @returns {Function} A class suitable for `game.settings.registerMenu`.
 */
export function licenseMenuClass() {
  const open = openLicenseCard;
  const Base = foundry.applications?.api?.ApplicationV2;
  if ( !Base ) {
    return class LicenseMenuShim {
      async render() {
        open();
        return this;
      }

      async close() {
        return this;
      }
    };
  }

  return class LicenseMenu extends Base {
    static DEFAULT_OPTIONS = { id: `${MODULE_ID}-menu` };

    /** @override — hand straight over to the card instead of drawing a form. */
    async render() {
      open();
      return this;
    }

    /** @override */
    async close() {
      return this;
    }
  };
}
