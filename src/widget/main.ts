const WIDGET_SOURCE = "oxygenchallenge";

function scriptOrigin(): string {
  const current = document.currentScript as HTMLScriptElement | null;
  if (current?.src) {
    return new URL(current.src).origin;
  }
  return location.origin;
}

const SOURCE_ORIGIN = scriptOrigin();

function collectClientContext(selectedLanguage: string): Record<string, unknown> {
  const navigatorWithHints = navigator as Navigator & {
    deviceMemory?: number;
    webdriver?: boolean;
  };
  const colorScheme = window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : window.matchMedia("(prefers-color-scheme: light)").matches
      ? "light"
      : "no-preference";
  return {
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "Etc/Unknown",
    timezoneOffsetMinutes: new Date().getTimezoneOffset(),
    systemLanguage: navigator.language || "und",
    languages: Array.from(navigator.languages ?? []).slice(0, 12),
    selectedLanguage: selectedLanguage || undefined,
    platform: navigator.platform || undefined,
    hardwareConcurrency: navigator.hardwareConcurrency || undefined,
    deviceMemory: navigatorWithHints.deviceMemory,
    touchPoints: navigator.maxTouchPoints,
    colorScheme,
    reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    webdriver: navigatorWithHints.webdriver === true,
    cookiesEnabled: navigator.cookieEnabled,
    screen: {
      width: screen.width,
      height: screen.height,
      pixelRatio: window.devicePixelRatio || 1,
      colorDepth: screen.colorDepth,
    },
  };
}

function inlineWidgetStyle(): string {
  return [
    ":host{position:relative;z-index:2147483000;display:block;width:var(--oc-width,400px);max-width:100%;height:96px;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}",
    "iframe{position:absolute;left:0;bottom:0;display:block;width:100%;height:96px;border:0;border-radius:0;background:transparent;overflow:hidden;transition:height 460ms cubic-bezier(.32,.72,0,1),bottom 460ms cubic-bezier(.32,.72,0,1);will-change:height,bottom}",
    "@media(prefers-reduced-motion:reduce){iframe{transition:none}}",
    ".oc-success{position:absolute;inset:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC',sans-serif}",
    ".oc-success-bar{position:relative;display:grid;grid-template-columns:44px minmax(0,1fr) 40px;align-items:center;gap:12px;height:72px;padding:0 14px;border:1px solid #cfd8e4;border-radius:4px;background:#fff;box-shadow:0 2px 5px rgba(23,32,51,.08)}",
    ".oc-success-check{display:grid;place-items:center;width:29px;height:29px;border-radius:4px;background:#168454}",
    ".oc-success-check::after{content:'';width:7px;height:14px;border:solid #fff;border-width:0 2.5px 2.5px 0;transform:rotate(45deg) translate(-1px,-1px)}",
    ".oc-success-label{color:#12633f;font-size:15px;font-weight:700;line-height:1.3}",
    ".oc-success-mark{display:block;width:30px;height:30px;justify-self:end;color:#111}",
    ".oc-success-brand{display:flex;align-items:center;justify-content:center;min-height:24px;padding-top:4px;color:#6e7a8c;font-size:11px;font-weight:650;text-align:center}",
    ".oc-error{padding:16px;border:1px solid rgba(127,29,29,.35);border-radius:8px;color:#7f1d1d;background:#fef2f2;font:14px/1.5 system-ui,sans-serif}",
  ].join("");
}

class OxygenChallengeElement extends HTMLElement {
  private frame: HTMLIFrameElement | null = null;
  private hiddenInput: HTMLInputElement | null = null;
  private verifiedToken: string | null = null;
  private successRenderTimer: number | null = null;
  private renderedSource = "";
  private readonly sourceOrigin = SOURCE_ORIGIN;

  connectedCallback(): void {
    this.render();
  }

  disconnectedCallback(): void {
    window.removeEventListener("message", this.onMessage);
  }

  reset(): void {
    if (this.successRenderTimer !== null) {
      window.clearTimeout(this.successRenderTimer);
      this.successRenderTimer = null;
    }
    this.hiddenInput?.remove();
    this.hiddenInput = null;
    this.verifiedToken = null;
    this.renderedSource = "";
    this.render();
  }

  private render(): void {
    if (this.verifiedToken) {
      this.renderCompactSuccess();
      return;
    }
    const siteKey = this.getAttribute("sitekey") ?? this.getAttribute("site-key");
    if (!siteKey) {
      this.frame = null;
      this.renderedSource = "";
      this.innerHTML = '<div class="oc-error">OxygenChallenge: sitekey is required.</div>';
      return;
    }

    const shadow = this.shadowRoot ?? this.attachShadow({ mode: "open" });
    const source = this.frameSource();
    if (
      this.frame &&
      this.renderedSource === source &&
      shadow.querySelector("iframe") === this.frame
    ) {
      window.removeEventListener("message", this.onMessage);
      window.addEventListener("message", this.onMessage);
      return;
    }

    window.removeEventListener("message", this.onMessage);
    shadow.innerHTML = `<style>${inlineWidgetStyle()}</style>`;
    this.frame = document.createElement("iframe");
    this.frame.title = "OxygenChallenge verification";
    this.frame.loading = "lazy";
    this.frame.referrerPolicy = "strict-origin-when-cross-origin";
    this.frame.allow = "autoplay; camera; microphone";
    this.frame.src = source;
    this.renderedSource = source;
    const width = Number.parseFloat(this.getAttribute("width") ?? "");
    if (Number.isFinite(width)) {
      this.style.setProperty("--oc-width", `${Math.max(280, Math.min(600, width))}px`);
    }
    shadow.append(this.frame);
    window.addEventListener("message", this.onMessage);
  }

  private renderCompactSuccess(): void {
    if (this.successRenderTimer !== null) {
      window.clearTimeout(this.successRenderTimer);
      this.successRenderTimer = null;
    }
    window.removeEventListener("message", this.onMessage);
    const shadow = this.shadowRoot ?? this.attachShadow({ mode: "open" });
    this.frame = null;
    this.renderedSource = "";
    shadow.innerHTML = `
      <style>${inlineWidgetStyle()}</style>
      <div class="oc-success" role="status" aria-label="验证通过">
        <div class="oc-success-bar">
          <span class="oc-success-check" aria-hidden="true"></span>
          <span class="oc-success-label">验证通过</span>
          <svg class="oc-success-mark" viewBox="0 0 64 64" role="img" aria-label="Oxygen">
            <circle cx="30" cy="35" r="23" fill="none" stroke="currentColor" stroke-width="6"></circle>
            <circle cx="38" cy="29" r="18" fill="none" stroke="currentColor" stroke-width="6"></circle>
          </svg>
        </div>
        <div class="oc-success-brand">Oxygen Challenge</div>
      </div>`;
  }

  private scheduleCompactSuccess(): void {
    if (this.successRenderTimer !== null) {
      window.clearTimeout(this.successRenderTimer);
    }
    const expectedToken = this.verifiedToken;
    this.successRenderTimer = window.setTimeout(() => {
      this.successRenderTimer = null;
      if (this.verifiedToken === expectedToken) {
        this.renderCompactSuccess();
      }
    }, 520);
  }

  private frameSource(): string {
    const siteKey = this.getAttribute("sitekey") ?? this.getAttribute("site-key") ?? "";
    const action = this.getAttribute("action") ?? "submit";
    const challengeType = this.getAttribute("challenge-type");
    const accessible = this.getAttribute("accessible");
    const risk = this.getAttribute("risk");
    const steps = this.getAttribute("steps");
    const apiVersion = this.getAttribute("api-version") === "1" ? "1" : "2";
    const selectedLanguage =
      this.getAttribute("user-language") ?? document.documentElement.lang;
    const url = new URL("/embed", this.sourceOrigin);
    url.searchParams.set("sitekey", siteKey);
    url.searchParams.set("action", action);
    url.searchParams.set("parentOrigin", location.origin);
    url.searchParams.set("apiVersion", apiVersion);
    if (apiVersion === "2") {
      url.searchParams.set(
        "clientContext",
        JSON.stringify(collectClientContext(selectedLanguage)),
      );
    }
    if (
      challengeType &&
      [
        "inverse_occlusion",
        "grid_select",
        "motion_drag",
        "audio_sequence",
        "calculation",
        "key_pointer",
        "pattern_memory",
        "count_flash",
        "market_trade",
        "human_check",
        "rotate_align",
        "semantic_pick",
        "turnstile",
        "hand_motion",
        "speech_wave",
      ].includes(challengeType)
    ) {
      url.searchParams.set("challengeType", challengeType);
    }
    if (accessible === "true" || accessible === "1" || accessible === "") {
      url.searchParams.set("accessible", "1");
    }
    if (risk === "low" || risk === "medium" || risk === "high" || risk === "critical") {
      url.searchParams.set("risk", risk);
    }
    if (steps && /^[1-8]$/.test(steps)) {
      url.searchParams.set("steps", steps);
    }
    return url.toString();
  }

  private onMessage = (event: MessageEvent): void => {
    if (event.origin !== this.sourceOrigin || !this.frame) {
      return;
    }
    const data = event.data as {
      source?: string;
      type?: string;
      token?: string;
      code?: string;
      height?: number;
      compact?: boolean;
      challengeType?: string;
      step?: number;
      totalSteps?: number;
    };
    if (data.source !== WIDGET_SOURCE) {
      return;
    }

    if (data.type === "resize" && typeof data.height === "number") {
      const height = Math.max(96, Math.min(760, Math.ceil(data.height)));
      if (this.frame) {
        this.frame.style.height = `${height}px`;
        if (data.compact === true || height <= 96) {
          this.frame.style.bottom = "0";
        } else {
          const rect = this.getBoundingClientRect();
          const availableAbove = Math.max(96, rect.bottom - 8);
          const downwardShift = Math.max(0, height - availableAbove);
          this.frame.style.bottom = downwardShift > 0 ? `${-downwardShift}px` : "0";
        }
      }
    } else if (data.type === "step") {
      this.dispatchEvent(
        new CustomEvent("oxygenchallenge:step", {
          detail: { step: data.step, totalSteps: data.totalSteps },
          bubbles: true,
        }),
      );
    } else if (data.type === "verified" && data.token) {
      this.verifiedToken = data.token;
      this.attachHiddenToken(data.token);
      this.dispatchEvent(
        new CustomEvent("oxygenchallenge:verified", { detail: { token: data.token }, bubbles: true }),
      );
      this.dispatchEvent(
        new CustomEvent("oxygenchallenge:complete", {
          detail: { token: data.token },
          bubbles: true,
        }),
      );
      if (this.verifiedToken === data.token) {
        this.scheduleCompactSuccess();
      }
    } else if (data.type === "preview-completed") {
      this.dispatchEvent(
        new CustomEvent("oxygenchallenge:preview-completed", {
          detail: { challengeType: data.challengeType },
          bubbles: true,
        }),
      );
    } else if (data.type === "failed" || data.type === "error") {
      this.dispatchEvent(
        new CustomEvent("oxygenchallenge:failed", {
          detail: { code: data.code ?? "UNKNOWN" },
          bubbles: true,
        }),
      );
    }
  };

  private attachHiddenToken(token: string): void {
    const name = this.getAttribute("name") ?? "oxygen-token";
    const form = this.closest("form");
    if (!form) {
      return;
    }
    if (!this.hiddenInput) {
      this.hiddenInput = document.createElement("input");
      this.hiddenInput.type = "hidden";
      this.hiddenInput.name = name;
      form.appendChild(this.hiddenInput);
    }
    this.hiddenInput.value = token;
  }
}

if (!customElements.get("oxygen-challenge")) {
  customElements.define("oxygen-challenge", OxygenChallengeElement);
}
