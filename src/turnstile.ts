export type TurnstileVerification = {
  success: boolean;
  errorCodes: string[];
};

export async function verifyTurnstile(
  secret: string,
  token: string,
  remoteIp?: string,
): Promise<TurnstileVerification> {
  const body = new URLSearchParams({
    secret,
    response: token,
  });
  if (remoteIp) {
    body.set("remoteip", remoteIp);
  }
  try {
    const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body,
      signal: AbortSignal.timeout(8_000),
    });
    const result = (await response.json()) as {
      success?: boolean;
      "error-codes"?: string[];
    };
    return {
      success: result.success === true,
      errorCodes: result["error-codes"] ?? [],
    };
  } catch {
    return { success: false, errorCodes: ["verification-unavailable"] };
  }
}
