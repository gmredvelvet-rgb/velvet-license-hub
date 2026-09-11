/**
 * Velvet License Hub — licence client.
 *
 * The reference soft-gate client (isometric-asset-palette, docs/SOFT-GATE.md)
 * with three deliberate differences, which are what make it a hub:
 *
 *  1. One Patreon connection licenses every module that consults the hub. The
 *     hub is its own installation on the server; covered modules never contact
 *     it while the hub is active.
 *  2. The fingerprint is stable across worlds (see #computeFingerprint). The
 *     reference hashed the world id, and localStorage is shared by every world
 *     on a server — so a second world revoked the credentials at its first
 *     refresh. A hub exists to be connected once; that could not stand.
 *  3. The world licence is a date plus the modules it covers (`worldLicence`),
 *     not a boolean. A boolean was sticky: once true, only the browser holding
 *     the tokens could ever turn it back off. A date lapses on its own when
 *     nobody re-verifies it, and needs no failure path to clear it. The list is
 *     what lets a $3 patron be licensed for velvet-mobile and nothing else.
 *
 * Credentials never leave this browser's localStorage. Only the date and the
 * list reach the world, because world settings are sent to every player — and
 * the access token is a bearer credential that also spends the owner's AI
 * Studio quota. Covered modules that need the server go through `request()`.
 *
 * Nothing here may ever block functionality: an unlicensed world keeps every
 * feature and only receives a periodic trial reminder.
 */

import { MODULE_ID, MODULE_TITLE, localize } from "./constants.js";
import { SETTING, worldLicence } from "./world.js";

const API_BASE = "https://vnd-license.gmredvelvet.workers.dev";

/**
 * Module identifier sent to the licence server. It must be one the server
 * knows: it registers each module as its own installation, and rejects auth
 * codes issued for an unknown id ("Invalid or expired auth code"). Add this
 * id to the worker's module whitelist before shipping.
 */
const LICENSE_MODULE_ID = MODULE_ID;

/**
 * RSA public key (SPKI base64url) — safe to embed: forging a signature
 * requires the private key, which never leaves the server. Used to verify
 * RS256-signed responses and access-token claims. Rotate here and in
 * wrangler.toml (JWT_PUBLIC_KEY) together.
 */
const RSA_PUBLIC_KEY = "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA3-hTzuHo9lgENNQiA4-Fm7VIdalqisZ5NhqrBioXmIXSMbEhYpy1TnPkCBAdAzXAsyX1YdTYLcMADETPnERvceLsDoAWHFZzHGxoXBkOGw0ukAyHJyrwBZxCf_bY_FSbip_-XQuTS4YuyhLPVNjbGMZdVarkegh7BKwW4CR9MDb1DMtf_NxtfNqJ3MxhfAiTxIod4AWer8esisr0IekQlPLmMPA2KggzQw9rFj61B4DAVk2F_TAXPMOKyEcX_zVGpp00JTurTsfwK2023UHKO9t98R0rG17oX0rK_x2EOBiW2Nla3NChZyR4yi8zHe0vjYhprqcwozv9wN0wbANnzwIDAQAB";

/** localStorage keys, namespaced to this module. */
const SK = Object.freeze({
  accessToken: `${MODULE_ID}:at`,
  refreshToken: `${MODULE_ID}:rt`,
  tokenExpiry: `${MODULE_ID}:exp`,
  installationId: `${MODULE_ID}:iid`,
  tier: `${MODULE_ID}:tier`,
  features: `${MODULE_ID}:features`,
  verifiedUntil: `${MODULE_ID}:until`
});

/** Heartbeat cadence and the outage tolerance before the licence lapses. */
const HEARTBEAT_MS = 15 * 60 * 1000;
const FIRST_HEARTBEAT_MS = 60 * 1000;
const GRACE_MS = 5 * 60 * 1000;

/**
 * How long a successful verification is trusted. Once the GM authorises, this
 * world is left alone for a month: a failing heartbeat, an unreachable server
 * or even a rejected refresh is logged but never brings the reminder back
 * inside the window. Every successful server exchange starts it over, so an
 * active subscriber is asked exactly once, ever.
 *
 * Only an explicit release clears it early; otherwise it simply runs out.
 */
const TRUST_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Only push the world licence's date forward when it gains at least this
 * much. Every heartbeat renews the trust window, and every world-setting write
 * broadcasts `updateSetting` to all connected clients — for a date thirty days
 * out, once a day is plenty.
 */
const PUBLISH_STEP_MS = 24 * 60 * 60 * 1000;

/**
 * Localize a `velvet-license-hub.License.*` key, interpolating `data` when given.
 * @param {string} key
 * @param {object} [data]
 * @returns {string}
 */
export const L = (key, data) => localize(`${MODULE_ID}.License.${key}`, data);

export class LicenseError extends Error {
  /** @param {string} message @param {string} code */
  constructor(message, code) {
    super(message);
    this.name = "LicenseError";
    this.code = code;
  }
}

export default class LicenseClient {
  /** @type {LicenseClient|null} */
  static #instance = null;

  #accessToken = null;
  #refreshToken = null;
  #tokenExpiry = 0;
  #installationId = null;
  #fingerprint = null;
  #features = [];
  #tier = "none";
  #verifiedUntil = 0;
  #heartbeatTimer = null;
  #firstHeartbeatTimer = null;
  #lastHeartbeat = 0;
  #degraded = false;
  #rsaKey = null;

  /** @returns {LicenseClient} */
  static get instance() {
    LicenseClient.#instance ??= new LicenseClient();
    return LicenseClient.#instance;
  }

  /* -------------------------------------------- */
  /*  Public surface                              */
  /* -------------------------------------------- */

  /** @type {Promise<boolean>|null} */
  #initPromise = null;

  /**
   * Restore a stored licence, refreshing the token when needed.
   *
   * Memoised: the hub's ready hook calls it, and so does the first `request()`
   * from a covered module — which can easily arrive first. Two runs would load
   * the tokens twice and could fire two refreshes of the same token.
   * @returns {Promise<boolean>} Whether this world may be treated as licensed —
   * either verified right now, or still inside its 30-day trust window.
   */
  initialize() {
    this.#initPromise ??= this.#initialize();
    return this.#initPromise;
  }

  async #initialize() {
    this.#installationId = this.#getOrCreateInstallationId();
    this.#fingerprint = await this.#computeFingerprint();
    this.#loadStoredTokens();

    if ( this.#accessToken && this.#isAccessTokenValid() ) {
      try {
        const claims = await this.#verifyJwt(this.#accessToken);
        this.#tier = claims.tier ?? "none";
        this.#features = claims.features ?? [];
        this.#startHeartbeat();
        return this.isLicensed;
      }
      catch ( err ) {
        console.warn(`${MODULE_TITLE} | Stored licence token rejected`, err);
        this.#clearStoredTokens();
        return this.isTrusted;
      }
    }

    if ( this.#refreshToken ) {
      try {
        await this.#refresh();
        this.#startHeartbeat();
        return this.isLicensed;
      }
      catch ( err ) {
        // A transient outage must never destroy a valid licence: keep the
        // tokens so the heartbeat can recover once the server is back.
        if ( this.#isTransient(err) ) {
          console.warn(`${MODULE_TITLE} | Licence server unreachable — keeping stored credentials`, err);
          this.#startHeartbeat();
          return this.isTrusted;
        }
        console.warn(`${MODULE_TITLE} | Licence refresh definitively rejected`, err);
        this.#clearStoredTokens();
      }
    }
    return this.isTrusted;
  }

  /** @returns {string} */
  get tier() {
    return this.#tier;
  }

  /** @returns {boolean} */
  get isLicensed() {
    if ( this.#tier === "none" ) return this.isTrusted;
    return !this.#degraded || this.isTrusted;
  }

  /**
   * @returns {boolean} Whether a past verification is still inside its 30-day
   * window. While it is, nothing may prompt or nag: the GM already said yes.
   */
  get isTrusted() {
    return this.#verifiedUntil > Date.now();
  }

  /** @returns {number} When the trust window lapses, as an epoch timestamp. */
  get trustedUntil() {
    return this.#verifiedUntil;
  }

  /** @returns {string|null} */
  get installationId() {
    return this.#installationId;
  }

  /**
   * @returns {boolean} True when a refresh token exists, so auto-recovery is
   * possible and the trial reminder should stay hidden during an outage.
   */
  get hasStoredCredentials() {
    return Boolean(this.#refreshToken);
  }

  /** @param {string} feature @returns {boolean} */
  hasFeature(feature) {
    if ( this.#degraded || !this.#isAccessTokenValid() ) return false;
    return this.#features.includes(feature);
  }

  /**
   * The module ids this browser's live verification covers, as the server put
   * them in the token (`module:<id>` features). Empty without a live token.
   * @returns {string[]}
   */
  get coveredModules() {
    return this.#features
      .filter(f => typeof f === "string" && f.startsWith("module:"))
      .map(f => f.slice("module:".length));
  }

  /**
   * Carry this browser's verification into the world, so players and every
   * covered module reach the same verdict without contacting the server.
   *
   * Writes when the date would gain at least PUBLISH_STEP_MS, or when the list
   * of covered modules changed — an upgrade or downgrade must reach the world on
   * the next beat, not a day later. The date is never shortened: another GM
   * browser may have pushed it further.
   */
  async publishWorldLicence() {
    if ( !game.user?.isGM || !this.isTrusted ) return;
    // Only a live verification knows what the tier covers. A browser coasting on
    // its trust window without a token has an empty list, and publishing that
    // would strip the world of modules it is still entitled to.
    const modules = this.coveredModules;
    if ( !modules.length ) return;
    const current = worldLicence();
    const gains = (this.#verifiedUntil - current.until) >= PUBLISH_STEP_MS;
    const changed = (modules.length !== current.modules.length)
      || modules.some(id => !current.modules.includes(id));
    if ( !gains && !changed ) return;
    await this.#writeWorldLicence({ until: Math.max(this.#verifiedUntil, current.until), modules });
  }

  /**
   * Authenticated call to the licence server on behalf of a covered module — the
   * shop catalogue, AI Studio. The hub's token carries the features of the whole
   * catalogue for its tier, so this one token passes every route's check.
   *
   * The token itself is never handed out (see the file header). Only a GM
   * browser holding credentials can do this; anywhere else it throws
   * `NO_CREDENTIALS` without touching the network.
   * @param {"GET"|"POST"} method
   * @param {string} path  Worker path, e.g. "/shops/data".
   * @param {object} [body] JSON body, POST only.
   * @returns {Promise<object>} The payload, signature-verified when signed.
   */
  async request(method, path, body = null) {
    if ( !["GET", "POST"].includes(method) ) throw new LicenseError(`Unsupported method ${method}`, "BAD_REQUEST");
    // The path is appended to API_BASE, so anything but a plain path could turn
    // the URL into another host — "@evil.example/x" reads as userinfo — and
    // carry the bearer token there. Plain segments, and an optional query of
    // plain pairs (AI Studio pages its history with `?limit=20`).
    if ( (typeof path !== "string") || !/^\/[A-Za-z0-9_\-/]+(\?[A-Za-z0-9_\-=&.]*)?$/.test(path) ) {
      throw new LicenseError("Invalid licence server path", "BAD_REQUEST");
    }
    if ( !game.user?.isGM ) throw new LicenseError("Only the GM's browser holds licence credentials", "NO_CREDENTIALS");
    await this.initialize();
    if ( !this.#refreshToken && !this.#isAccessTokenValid() ) {
      throw new LicenseError("No licence credentials in this browser", "NO_CREDENTIALS");
    }
    if ( !this.#isAccessTokenValid() ) await this.#refresh();

    const send = () => this.#apiCall(path, method === "POST" ? (body ?? {}) : null, { method, nonce: false });
    try {
      return await send();
    }
    catch ( err ) {
      // The server can expire or revoke an access token before our clock says
      // so. One refresh and one retry; anything beyond that is a real verdict.
      if ( !["TOKEN_EXPIRED", "INVALID_TOKEN"].includes(err.code) || !this.#refreshToken ) throw err;
      await this.#refresh();
      return send();
    }
  }

  /**
   * Open the Patreon consent popup and activate on success.
   * @returns {Promise<boolean>} False when the user closed the popup.
   */
  async startOAuth() {
    const { url } = await this.#apiCall("/oauth/start", {
      origin: globalThis.location.origin,
      moduleId: LICENSE_MODULE_ID
    });
    const popup = window.open(url, "vnd-patreon-auth", "width=600,height=700,popup=yes");
    // A blocked popup returns null. Without this the close-poll below would
    // never fire (`popup?.closed` is undefined, never true) and the promise
    // would never settle, leaving the Connect button disabled forever.
    if ( !popup ) return false;

    return new Promise((resolve, reject) => {
      const expectedOrigin = new URL(API_BASE).origin;
      let interval = null;

      const handler = async event => {
        if ( (event.origin !== expectedOrigin) || (event.data?.type !== "vnd-auth-code") ) return;
        window.removeEventListener("message", handler);
        if ( interval ) clearInterval(interval);
        const { authCode } = event.data;
        popup?.close();
        try {
          await this.activateWithCode(authCode);
          resolve(true);
        }
        catch ( err ) {
          // Carry the code out with the failure: it is single-use and
          // short-lived, so losing it here would force the whole Patreon
          // round trip again. The UI offers it back for a retry.
          err.authCode = authCode;
          reject(err);
        }
      };
      window.addEventListener("message", handler);

      interval = setInterval(() => {
        if ( !popup.closed ) return;
        clearInterval(interval);
        // The message can still be in flight when the popup closes, so give
        // it a moment before declaring the flow cancelled.
        setTimeout(() => {
          window.removeEventListener("message", handler);
          resolve(false);
        }, 1500);
      }, 1000);
    });
  }

  /**
   * Exchange an auth code for tokens and mark the world as licensed.
   * @param {string} authCode
   */
  async activateWithCode(authCode) {
    const result = await this.#apiCall("/oauth/exchange", {
      authCode,
      installationId: this.#installationId,
      fingerprintHash: this.#fingerprint,
      moduleId: LICENSE_MODULE_ID
    });

    this.#storeTokens(result);
    this.#degraded = false;
    this.#startHeartbeat();
    await this.publishWorldLicence();
    ui.notifications?.info(`${MODULE_TITLE}: ${L("Connected", { tier: result.tier })}`);
  }

  /** Free this installation slot so it can be used on another device. */
  async releaseInstallation() {
    try {
      await this.#apiCall("/license/release", { installationId: this.#installationId });
      // An explicit release is the one thing that ends the trust window early:
      // the GM is handing this slot to another machine on purpose.
      this.#verifiedUntil = 0;
      localStorage.removeItem(SK.verifiedUntil);
      this.#clearStoredTokens();
      this.#stopHeartbeat();
      // Only this world can be reached from here. Other worlds keep the date
      // they were given and lapse on their own within the trust window.
      await this.#writeWorldLicence({ until: 0, modules: [] });
      ui.notifications?.info(`${MODULE_TITLE}: ${L("Released")}`);
      return true;
    }
    catch ( err ) {
      ui.notifications?.error(`${MODULE_TITLE}: ${err.message}`);
      return false;
    }
  }

  /* -------------------------------------------- */
  /*  Token storage                               */
  /* -------------------------------------------- */

  #loadStoredTokens() {
    this.#accessToken = localStorage.getItem(SK.accessToken);
    this.#refreshToken = localStorage.getItem(SK.refreshToken);
    this.#tokenExpiry = Number.parseInt(localStorage.getItem(SK.tokenExpiry) ?? "0", 10);
    this.#tier = localStorage.getItem(SK.tier) ?? "none";
    this.#verifiedUntil = Number.parseInt(localStorage.getItem(SK.verifiedUntil) ?? "0", 10) || 0;
    try {
      const parsed = JSON.parse(localStorage.getItem(SK.features) ?? "[]");
      this.#features = Array.isArray(parsed) ? parsed : [];
    }
    catch ( err ) {
      this.#features = [];
    }
  }

  /**
   * Persist a successful server exchange. This is the single choke point for
   * activation, refresh and heartbeat, so renewing the trust window here is
   * what guarantees an active subscriber is never asked a second time.
   * @param {object} result Server payload with tokens and entitlements.
   */
  #storeTokens({ accessToken, refreshToken, expiresIn, tier, features }) {
    const expiry = Date.now() + ((expiresIn ?? 0) * 1000);
    this.#accessToken = accessToken;
    if ( refreshToken ) this.#refreshToken = refreshToken;
    this.#tokenExpiry = expiry;
    // `/token/refresh` answers without a tier: absent means unchanged, not
    // lapsed. Only the OAuth exchange and the heartbeat report entitlements,
    // and the heartbeat says "none" out loud when a subscription ends.
    if ( tier !== undefined ) this.#tier = tier;
    if ( features !== undefined ) this.#features = features;

    localStorage.setItem(SK.accessToken, accessToken);
    if ( refreshToken ) localStorage.setItem(SK.refreshToken, refreshToken);
    localStorage.setItem(SK.tokenExpiry, String(expiry));
    localStorage.setItem(SK.tier, this.#tier);
    localStorage.setItem(SK.features, JSON.stringify(this.#features));

    // Only an entitled tier renews the window. Renewing it on a "none" answer
    // would mean a cancelled subscriber is never asked again, so that case is
    // left to run the remainder of whatever a past verification bought.
    if ( this.#tier !== "none" ) {
      this.#verifiedUntil = Date.now() + TRUST_MS;
      localStorage.setItem(SK.verifiedUntil, String(this.#verifiedUntil));
    }
  }

  /**
   * Drop the credentials but keep the trust window: dead tokens are useless,
   * yet the GM did authorise, and that answer stands for its full 30 days.
   * Only an explicit release ends it early.
   */
  #clearStoredTokens() {
    this.#accessToken = null;
    this.#refreshToken = null;
    this.#tokenExpiry = 0;
    this.#tier = "none";
    this.#features = [];
    const keep = new Set([SK.installationId, SK.verifiedUntil]);
    for ( const key of Object.values(SK) ) {
      if ( !keep.has(key) ) localStorage.removeItem(key);
    }
  }

  /** @returns {boolean} */
  #isAccessTokenValid() {
    return Boolean(this.#accessToken) && (this.#tokenExpiry > (Date.now() + 60_000));
  }

  #getOrCreateInstallationId() {
    let id = localStorage.getItem(SK.installationId);
    if ( !id ) {
      id = crypto.randomUUID();
      localStorage.setItem(SK.installationId, id);
    }
    return id;
  }

  /* -------------------------------------------- */
  /*  Heartbeat                                   */
  /* -------------------------------------------- */

  #startHeartbeat() {
    this.#stopHeartbeat();
    this.#lastHeartbeat = Date.now();
    this.#firstHeartbeatTimer = setTimeout(() => {
      this.#firstHeartbeatTimer = null;
      this.#heartbeat();
    }, FIRST_HEARTBEAT_MS);
    this.#heartbeatTimer = setInterval(() => this.#heartbeat(), HEARTBEAT_MS);
  }

  #stopHeartbeat() {
    if ( this.#firstHeartbeatTimer ) clearTimeout(this.#firstHeartbeatTimer);
    if ( this.#heartbeatTimer ) clearInterval(this.#heartbeatTimer);
    this.#firstHeartbeatTimer = this.#heartbeatTimer = null;
  }

  async #heartbeat() {
    try {
      const result = await this.#apiCall("/heartbeat", {
        installationId: this.#installationId,
        fingerprintHash: this.#fingerprint
      });
      this.#storeTokens({ ...result, refreshToken: null });
      this.#lastHeartbeat = Date.now();
      this.#degraded = false;
      // A live tier renewed the trust window inside #storeTokens; carry it into
      // the world. "none" — a cancelled subscription — renews nothing, so the
      // date the last good verification bought simply runs out.
      await this.publishWorldLicence();
    }
    catch ( err ) {
      this.#onHeartbeatFailure(err);
    }
  }

  /** @param {Error} err */
  #onHeartbeatFailure(err) {
    // Definitive rejections lapse immediately; outages get the grace period,
    // because a flaky connection must not start nagging mid-session.
    const definitive = !this.#isTransient(err);
    const expired = (Date.now() - this.#lastHeartbeat) > GRACE_MS;
    if ( !definitive && !expired ) return;

    // Log the degradation once, but re-check the trust window on every later
    // failure too — otherwise the reminder could never return once it lapses.
    if ( !this.#degraded ) {
      this.#degraded = true;
      console.warn(`${MODULE_TITLE} | Licence heartbeat failed`, err);
    }
    // Nothing to switch off: the world licence is a date and lapses by itself
    // once nobody renews it. An outage must never end it early.
  }

  /**
   * Transport hiccups are safe to retry and must never destroy tokens;
   * anything else is a verdict from the licence server.
   * @param {Error} err
   * @returns {boolean}
   */
  #isTransient(err) {
    if ( !(err instanceof LicenseError) ) return true;
    return ["NETWORK_ERROR", "INTERNAL_ERROR", "RATE_LIMITED", "NOT_FOUND", "API_ERROR"].includes(err.code);
  }

  /** @param {{until: number, modules: string[]}} licence  `until: 0` clears it. */
  async #writeWorldLicence(licence) {
    if ( !game.user?.isGM ) return;
    try {
      await game.settings.set(MODULE_ID, SETTING, licence);
    }
    catch ( err ) {
      console.warn(`${MODULE_TITLE} | Could not persist the world licence`, err);
    }
  }

  /* -------------------------------------------- */
  /*  Transport                                   */
  /* -------------------------------------------- */

  /**
   * Serialises token rotation. The server revokes the old refresh token the
   * moment it is used and treats a second presentation as reuse — a critical
   * SECURITY_VIOLATION that revokes the whole family. Two overlapping refreshes
   * were enough to trigger it; the trust window then hid the damage, but the
   * credentials were gone all the same.
   * @type {Promise<void>|null}
   */
  #refreshInFlight = null;

  async #refresh() {
    this.#refreshInFlight ??= this.#refreshOnce()
      .finally(() => { this.#refreshInFlight = null; });
    return this.#refreshInFlight;
  }

  async #refreshOnce() {
    const result = await this.#apiCall("/token/refresh", {
      refreshToken: this.#refreshToken,
      fingerprintHash: this.#fingerprint
    });
    this.#storeTokens(result);
  }

  /**
   * @param {string} endpoint
   * @param {object|null} body
   * @param {object} [options]
   * @param {"GET"|"POST"} [options.method]
   * @param {boolean} [options.nonce]  Stamp nonce + timestamp into the body. The
   *   licence routes require it (anti-replay); content routes such as /shops/data
   *   and /ai/* do not, and a GET has no body to carry it.
   * @returns {Promise<object>}
   */
  async #apiCall(endpoint, body, { method = "POST", nonce = true } = {}) {
    const init = {
      method,
      headers: {
        "Content-Type": "application/json",
        "X-Installation-ID": this.#installationId ?? ""
      }
    };
    if ( this.#accessToken ) init.headers.Authorization = `Bearer ${this.#accessToken}`;
    if ( body ) {
      init.body = JSON.stringify(nonce ? { ...body, nonce: crypto.randomUUID(), timestamp: Date.now() } : body);
    }

    let response;
    try {
      response = await fetch(`${API_BASE}${endpoint}`, init);
    }
    catch ( err ) {
      throw new LicenseError(err?.message ?? "Network error", "NETWORK_ERROR");
    }

    if ( !response.ok ) {
      const err = await response.json().catch(() => ({}));
      throw new LicenseError(err.error ?? `Request failed (${response.status})`, err.code ?? "API_ERROR");
    }

    const data = await response.json();
    if ( data.sig && data.payload ) {
      await this.#verifyResponse(data.payload, data.sig);
      return data.payload;
    }
    return data;
  }

  /* -------------------------------------------- */
  /*  Signature verification                      */
  /* -------------------------------------------- */

  /** @param {string} value base64url text @returns {Uint8Array} */
  static #decodeBase64Url(value) {
    const base64 = value.replaceAll("-", "+").replaceAll("_", "/");
    // JWT segments drop their "=" padding. Browsers are lenient about that
    // today, but atob() is specified to reject a non-multiple-of-4 input, so
    // restore the padding rather than rely on the leniency lasting.
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
    return Uint8Array.from(atob(padded), c => c.codePointAt(0));
  }

  async #importRsaKey() {
    this.#rsaKey ??= await crypto.subtle.importKey(
      "spki",
      LicenseClient.#decodeBase64Url(RSA_PUBLIC_KEY),
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"]
    );
    return this.#rsaKey;
  }

  /**
   * @param {string} token
   * @returns {Promise<object>} Verified claims.
   */
  async #verifyJwt(token) {
    const parts = token.split(".");
    if ( parts.length !== 3 ) throw new LicenseError("Malformed token", "INVALID_TOKEN");
    const [header, body, signature] = parts;

    const valid = await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5",
      await this.#importRsaKey(),
      LicenseClient.#decodeBase64Url(signature),
      new TextEncoder().encode(`${header}.${body}`)
    );
    if ( !valid ) throw new LicenseError("Token signature invalid", "INVALID_TOKEN");

    const claims = JSON.parse(new TextDecoder().decode(LicenseClient.#decodeBase64Url(body)));
    if ( claims.exp && (claims.exp < Math.floor(Date.now() / 1000)) ) {
      throw new LicenseError("Token expired", "TOKEN_EXPIRED");
    }
    return claims;
  }

  /**
   * @param {object} payload
   * @param {string} jwt
   */
  async #verifyResponse(payload, jwt) {
    const claims = await this.#verifyJwt(jwt);
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(payload)));
    const expected = btoa(String.fromCodePoint(...new Uint8Array(digest)))
      .replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
    if ( claims.ph !== expected ) throw new LicenseError("Response payload tampered", "SIGNATURE_INVALID");
  }

  /* -------------------------------------------- */
  /*  Fingerprint                                 */
  /* -------------------------------------------- */

  /**
   * Device binding sent with every refresh and heartbeat. The server compares
   * it byte for byte at /token/refresh and, on a mismatch, revokes the whole
   * token family as a stolen token.
   *
   * Built only from what cannot drift under a legitimate user: the
   * installation id, which lives in the same localStorage as the refresh token
   * it protects. The previous recipe also hashed the world id, the Foundry
   * version, the screen size and a canvas render. localStorage is shared by
   * every world on the same server, so opening a second world, updating
   * Foundry or plugging in another monitor presented a new fingerprint and got
   * the GM's credentials revoked. Those components never added real binding:
   * whoever can read the refresh token can read the installation id beside it.
   */
  async #computeFingerprint() {
    const digest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(`vne-fp-v2|${this.#installationId}`)
    );
    return btoa(String.fromCodePoint(...new Uint8Array(digest)));
  }
}
