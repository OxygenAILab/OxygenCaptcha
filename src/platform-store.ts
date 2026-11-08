import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  randomUUID,
} from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { isIP } from "node:net";
import { dirname, resolve } from "node:path";
import type { SiteConfig } from "./types.js";

type StoredApp = {
  id: string;
  ownerSub: string;
  ownerName: string;
  name: string;
  siteKey: string;
  encryptedSecret: string;
  origins: string[];
  actions: string[];
  createdAt: string;
  updatedAt: string;
  active: boolean;
  ipBypasses: Array<{
    ip: string;
    createdAt: string;
    expiresAt: string;
  }>;
};

type StoreDocument = {
  version: 1;
  apps: StoredApp[];
};

export type PlatformApp = {
  id: string;
  ownerSub: string;
  ownerName: string;
  name: string;
  siteKey: string;
  origins: string[];
  actions: string[];
  createdAt: string;
  updatedAt: string;
  active: boolean;
  ipBypasses: Array<{
    ip: string;
    createdAt: string;
    expiresAt: string;
  }>;
};

export type CreatedPlatformApp = PlatformApp & {
  secret: string;
};

export class PlatformStore {
  private document: StoreDocument = { version: 1, apps: [] };
  private readonly dataFile: string;

  constructor(
    dataFile: string,
    private readonly dataKey: Buffer,
    private readonly sites: SiteConfig[],
  ) {
    this.dataFile = resolve(dataFile);
  }

  async load(): Promise<void> {
    try {
      const raw = await readFile(this.dataFile, "utf8");
      const parsed = JSON.parse(raw) as StoreDocument;
      if (parsed.version !== 1 || !Array.isArray(parsed.apps)) {
        throw new Error("Unsupported platform data file");
      }
      this.document = {
        version: 1,
        apps: parsed.apps.map((app) => ({
          ...app,
          ipBypasses: Array.isArray(app.ipBypasses) ? app.ipBypasses : [],
        })),
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
    }
    for (const app of this.document.apps) {
      if (!app.active) {
        continue;
      }
      const secret = this.decrypt(app.encryptedSecret);
      this.sites.push({
        key: app.siteKey,
        secret,
        origins: app.origins,
        actions: app.actions,
      });
    }
  }

  list(ownerSub: string): PlatformApp[] {
    return this.document.apps
      .filter((app) => app.ownerSub === ownerSub)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .map((app) => this.publicApp(app));
  }

  async create(
    owner: { sub: string; name: string },
    input: { name: string; origins: string[]; actions: string[] },
  ): Promise<CreatedPlatformApp> {
    const now = new Date().toISOString();
    const secret = `oc_sec_${randomBytes(32).toString("base64url")}`;
    const app: StoredApp = {
      id: randomUUID(),
      ownerSub: owner.sub,
      ownerName: owner.name,
      name: input.name,
      siteKey: `oc_${randomBytes(14).toString("base64url")}`,
      encryptedSecret: this.encrypt(secret),
      origins: input.origins,
      actions: input.actions,
      createdAt: now,
      updatedAt: now,
      active: true,
      ipBypasses: [],
    };
    this.document.apps.push(app);
    this.sites.push({
      key: app.siteKey,
      secret,
      origins: app.origins,
      actions: app.actions,
    });
    await this.persist();
    return { ...this.publicApp(app), secret };
  }

  async rotate(ownerSub: string, id: string): Promise<CreatedPlatformApp | undefined> {
    const app = this.document.apps.find(
      (candidate) => candidate.id === id && candidate.ownerSub === ownerSub && candidate.active,
    );
    if (!app) {
      return undefined;
    }
    const secret = `oc_sec_${randomBytes(32).toString("base64url")}`;
    app.encryptedSecret = this.encrypt(secret);
    app.updatedAt = new Date().toISOString();
    const site = this.sites.find((candidate) => candidate.key === app.siteKey);
    if (site) {
      site.secret = secret;
    }
    await this.persist();
    return { ...this.publicApp(app), secret };
  }

  async archive(ownerSub: string, id: string): Promise<boolean> {
    const app = this.document.apps.find(
      (candidate) => candidate.id === id && candidate.ownerSub === ownerSub && candidate.active,
    );
    if (!app) {
      return false;
    }
    app.active = false;
    app.updatedAt = new Date().toISOString();
    const index = this.sites.findIndex((candidate) => candidate.key === app.siteKey);
    if (index >= 0) {
      this.sites.splice(index, 1);
    }
    await this.persist();
    return true;
  }

  activeIpBypass(
    siteKey: string,
    ip: string,
    now = Date.now(),
  ): { appId: string; expiresAt: string } | undefined {
    const app = this.document.apps.find(
      (candidate) => candidate.siteKey === siteKey && candidate.active,
    );
    const rule = app?.ipBypasses.find(
      (candidate) =>
        candidate.ip === ip && Date.parse(candidate.expiresAt) > now,
    );
    return app && rule
      ? { appId: app.id, expiresAt: rule.expiresAt }
      : undefined;
  }

  async setIpBypass(
    ownerSub: string,
    id: string,
    ip: string,
    durationMinutes: number,
  ): Promise<PlatformApp | undefined> {
    const app = this.document.apps.find(
      (candidate) =>
        candidate.id === id && candidate.ownerSub === ownerSub && candidate.active,
    );
    if (
      !app ||
      !isIP(ip) ||
      !Number.isInteger(durationMinutes) ||
      durationMinutes < 1 ||
      durationMinutes > 179
    ) {
      return undefined;
    }
    const now = Date.now();
    const rule = {
      ip,
      createdAt: new Date(now).toISOString(),
      expiresAt: new Date(now + durationMinutes * 60_000).toISOString(),
    };
    app.ipBypasses = [
      ...app.ipBypasses.filter(
        (candidate) =>
          candidate.ip !== ip && Date.parse(candidate.expiresAt) > now,
      ),
      rule,
    ];
    app.updatedAt = rule.createdAt;
    await this.persist();
    return this.publicApp(app);
  }

  async clearIpBypass(
    ownerSub: string,
    id: string,
    ip: string,
  ): Promise<PlatformApp | undefined> {
    const app = this.document.apps.find(
      (candidate) =>
        candidate.id === id && candidate.ownerSub === ownerSub && candidate.active,
    );
    if (!app) {
      return undefined;
    }
    app.ipBypasses = app.ipBypasses.filter((candidate) => candidate.ip !== ip);
    app.updatedAt = new Date().toISOString();
    await this.persist();
    return this.publicApp(app);
  }

  private publicApp(app: StoredApp): PlatformApp {
    const { encryptedSecret: _, ...rest } = app;
    const now = Date.now();
    return {
      ...rest,
      ipBypasses: app.ipBypasses.filter(
        (candidate) => Date.parse(candidate.expiresAt) > now,
      ),
    };
  }

  private encrypt(value: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.dataKey, iv);
    const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `v1:${iv.toString("base64url")}:${tag.toString("base64url")}:${encrypted.toString("base64url")}`;
  }

  private decrypt(value: string): string {
    const [version, ivValue, tagValue, encryptedValue] = value.split(":");
    if (
      version !== "v1" ||
      !ivValue ||
      !tagValue ||
      !encryptedValue
    ) {
      throw new Error("Invalid encrypted platform app secret");
    }
    const decipher = createDecipheriv(
      "aes-256-gcm",
      this.dataKey,
      Buffer.from(ivValue, "base64url"),
    );
    decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(encryptedValue, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  }

  private async persist(): Promise<void> {
    await mkdir(dirname(this.dataFile), { recursive: true });
    const temporary = `${this.dataFile}.${process.pid}.tmp`;
    await writeFile(temporary, JSON.stringify(this.document, null, 2), {
      encoding: "utf8",
      mode: 0o600,
    });
    await rename(temporary, this.dataFile);
  }
}
