export type FrontendBuildStatus = "queued" | "disabled" | "failed";

export type FrontendBuildResult = {
  status: FrontendBuildStatus;
  message: string;
  providerStatus?: number;
};

const hookUrl = () => process.env.FRONTEND_BUILD_HOOK_URL?.trim() || "";

export const triggerFrontendBuild = async (
  reason: string
): Promise<FrontendBuildResult> => {
  const configuredUrl = hookUrl();
  if (!configuredUrl) {
    return {
      status: "disabled",
      message: "Frontend build hook is not configured.",
    };
  }

  let url: URL;
  try {
    url = new URL(configuredUrl);
    if (url.protocol !== "https:") throw new Error("HTTPS required");
  } catch {
    return {
      status: "failed",
      message: "Frontend build hook configuration is invalid.",
    };
  }

  url.searchParams.set("trigger_title", `Creativa Poeta SEO: ${reason}`.slice(0, 120));
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    Math.max(3_000, Number(process.env.FRONTEND_BUILD_HOOK_TIMEOUT_MS) || 10_000)
  );

  try {
    const response = await fetch(url, {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason, source: "creativa-poeta-admin" }),
    });

    if (!response.ok) {
      console.error("Frontend build hook failed:", response.status);
      return {
        status: "failed",
        providerStatus: response.status,
        message: "The frontend provider rejected the build request.",
      };
    }

    return {
      status: "queued",
      providerStatus: response.status,
      message: "Frontend SEO rebuild queued.",
    };
  } catch (error) {
    console.error(
      "Frontend build hook unavailable:",
      error instanceof Error ? error.message : "unknown error"
    );
    return {
      status: "failed",
      message: "The article was saved, but the frontend rebuild could not be queued.",
    };
  } finally {
    clearTimeout(timeout);
  }
};