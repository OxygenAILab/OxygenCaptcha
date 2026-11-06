import {
  createPrivateKey,
  createPublicKey,
  randomBytes,
  randomUUID,
  sign,
  verify,
} from "node:crypto";

const PRIVATE_KEY_PREFIX = Buffer.from("302e020100300506032b657004220420", "hex");

export type TokenPayload = {
  iss: string;
  aud: string;
  sub: string;
  siteKey: string;
  action: string;
  assuranceLevel: "A1";
  iat: number;
  nbf: number;
  exp: number;
  jti: string;
};

export type TokenIssueInput = {
  siteKey: string;
  action: string;
  assuranceLevel: "A1";
};

type PublicJwk = {
  kty: string;
  crv: string;
  x: string;
  alg: string;
  use: string;
  kid: string;
  [key: string]: unknown;
};

export type TokenVerification =
  | { ok: true; payload: TokenPayload }
  | {
      ok: false;
      code:
        | "INVALID_TOKEN"
        | "TOKEN_EXPIRED"
        | "TOKEN_REPLAYED"
        | "ACTION_MISMATCH"
        | "SITE_MISMATCH";
    };

function base64url(value: string | Buffer): string {
  return Buffer.from(value).toString("base64url");
}

function jsonPart<T>(value: T): string {
  return base64url(JSON.stringify(value));
}

export class TokenService {
  private readonly privateKey;
  private readonly publicKey;
  private readonly publicJwk: PublicJwk;
  private readonly consumed = new Map<string, number>();
  private readonly issuer: string;
  private readonly ttlSeconds: number;
  private readonly kid = randomBytes(6).toString("hex");

  constructor(issuer: string, ttlSeconds: number, seed?: Buffer) {
    const effectiveSeed = seed ?? randomBytes(32);
    const privateKeyDer = Buffer.concat([PRIVATE_KEY_PREFIX, effectiveSeed]);
    this.privateKey = createPrivateKey({ key: privateKeyDer, format: "der", type: "pkcs8" });
    this.publicKey = createPublicKey(this.privateKey);
    const exported = this.publicKey.export({ format: "jwk" });
    this.publicJwk = { ...exported, alg: "EdDSA", use: "sig", kid: this.kid } as PublicJwk;
    this.issuer = issuer;
    this.ttlSeconds = ttlSeconds;
  }

  issue(input: TokenIssueInput): string {
    this.cleanup();
    const now = Math.floor(Date.now() / 1000);
    const payload: TokenPayload = {
      iss: this.issuer,
      aud: input.siteKey,
      sub: "oxygenchallenge.verification",
      siteKey: input.siteKey,
      action: input.action,
      assuranceLevel: input.assuranceLevel,
      iat: now,
      nbf: now - 1,
      exp: now + this.ttlSeconds,
      jti: randomUUID(),
    };

    const header = jsonPart({ alg: "EdDSA", typ: "JWT", kid: this.kid });
    const body = jsonPart(payload);
    const unsigned = `${header}.${body}`;
    const signature = sign(null, Buffer.from(unsigned), this.privateKey).toString("base64url");
    this.consumed.set(payload.jti, payload.exp);
    return `${unsigned}.${signature}`;
  }

  verify(token: string, expected?: { siteKey?: string; action?: string }): TokenVerification {
    const parts = token.split(".");
    if (parts.length !== 3) {
      return { ok: false, code: "INVALID_TOKEN" };
    }
    const [header, body, signature] = parts;
    if (!header || !body || !signature) {
      return { ok: false, code: "INVALID_TOKEN" };
    }

    let payload: TokenPayload;
    try {
      payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as TokenPayload;
    } catch {
      return { ok: false, code: "INVALID_TOKEN" };
    }

    const signatureOk = verify(
      null,
      Buffer.from(`${header}.${body}`),
      this.publicKey,
      Buffer.from(signature, "base64url"),
    );
    if (!signatureOk) {
      return { ok: false, code: "INVALID_TOKEN" };
    }
    if (payload.iss !== this.issuer) {
      return { ok: false, code: "INVALID_TOKEN" };
    }
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp <= now || payload.nbf > now + 5) {
      return { ok: false, code: "TOKEN_EXPIRED" };
    }
    if (expected?.siteKey && payload.siteKey !== expected.siteKey) {
      return { ok: false, code: "SITE_MISMATCH" };
    }
    if (expected?.action && payload.action !== expected.action) {
      return { ok: false, code: "ACTION_MISMATCH" };
    }
    if (!this.consumed.has(payload.jti)) {
      return { ok: false, code: "TOKEN_REPLAYED" };
    }

    return { ok: true, payload };
  }

  consume(jti: string): boolean {
    return this.consumed.delete(jti);
  }

  jwks(): { keys: PublicJwk[] } {
    return { keys: [this.publicJwk] };
  }

  private cleanup(): void {
    const now = Math.floor(Date.now() / 1000);
    for (const [jti, expiresAt] of this.consumed) {
      if (expiresAt <= now) {
        this.consumed.delete(jti);
      }
    }
  }
}
