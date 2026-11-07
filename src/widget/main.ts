const WIDGET_SOURCE = "oxygenchallenge";

function scriptOrigin(): string {
  const current = document.currentScript as HTMLScriptElement | null;
  if (current?.src) {
    return new URL(current.src).origin;
  }
  return location.origin;
}

const SOURCE_ORIGIN = scriptOrigin();

function inlineWidgetStyle(): string {
  return [
    ":host{position:relative;z-index:2147483000;display:block;width:var(--oc-width,400px);max-width:100%;height:96px;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}",
    "iframe{position:absolute;left:0;bottom:0;display:block;width:100%;height:96px;border:0;border-radius:0;background:transparent}",
    ".oc-error{padding:16px;border:1px solid rgba(127,29,29,.35);border-radius:8px;color:#7f1d1d;background:#fef2f2;font:14px/1.5 system-ui,sans-serif}",
  ].join("");
}

class OxygenChallengeElement extends HTMLElement {
  private frame: HTMLIFrameElement | null = null;
  private hiddenInput: HTMLInputElement | null = null;
  private readonly sourceOrigin = SOURCE_ORIGIN;

  connectedCallback(): void {
    this.render();
  }

  disconnectedCallback(): void {
    window.removeEventListener("message", this.onMessage);
  }

  reset(): void {
    this.hiddenInput?.remove();
    this.hiddenInput = null;
    if (this.frame) {
      this.frame.style.height = "96px";
      this.frame.src = this.frameSource();
    }
  }

  private render(): void {
    const siteKey = this.getAttribute("sitekey") ?? this.getAttribute("site-key");
    if (!siteKey) {
      this.innerHTML = '<div class="oc-error">OxygenChallenge: sitekey is required.</div>';
      return;
    }

    window.removeEventListener("message", this.onMessage);
    const shadow = this.shadowRoot ?? this.attachShadow({ mode: "open" });
    shadow.innerHTML = `<style>${inlineWidgetStyle()}</style>`;
    this.frame = document.createElement("iframe");
    this.frame.title = "OxygenChallenge verification";
    this.frame.loading = "lazy";
    this.frame.referrerPolicy = "strict-origin-when-cross-origin";
    this.frame.allow = "autoplay; camera; microphone";
    this.frame.src = this.frameSource();
    const width = Number.parseFloat(this.getAttribute("width") ?? "");
    if (Number.isFinite(width)) {
      this.style.setProperty("--oc-width", `${Math.max(280, Math.min(600, width))}px`);
    }
    shadow.append(this.frame);
    window.addEventListener("message", this.onMessage);
  }

  private frameSource(): string {
    const siteKey = this.getAttribute("sitekey") ?? this.getAttribute("site-key") ?? "";
    const action = this.getAttribute("action") ?? "submit";
    const challengeType = this.getAttribute("challenge-type");
    const accessible = this.getAttribute("accessible");
    const risk = this.getAttribute("risk");
    const steps = this.getAttribute("steps");
    const url = new URL("/embed", this.sourceOrigin);
    url.searchParams.set("sitekey", siteKey);
    url.searchParams.set("action", action);
    url.searchParams.set("parentOrigin", location.origin);
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
    if (event.origin !== this.sourceOrigin || event.source !== this.frame?.contentWindow) {
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
      this.appendChild(this.hiddenInput);
    }
    this.hiddenInput.value = token;
  }
}

if (!customElements.get("oxygen-challenge")) {
  customElements.define("oxygen-challenge", OxygenChallengeElement);
}
