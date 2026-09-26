import { secrets } from "bun";
import {
definePrivilegedContracts,
definePrivilegedHandlers,
z,
} from "@hatch/space-sdk";

const FINNHUB_SECRET_SERVICE = "muse-web-artifact:dca-portfolio-tracker";
const FINNHUB_SECRET_NAME = "finnhub-api-key";

export const privileged = definePrivilegedContracts({
  readFinnhubApiKey: {
    request: z.object({}),
    response: z.object({ apiKey: z.string().nullable() }),
    capabilities: ["credentials.read"],
    timeoutMs: 10_000,
  },
  storeFinnhubApiKey: {
    request: z.object({ apiKey: z.string().trim().min(1).max(256) }),
    response: z.object({ ok: z.boolean() }),
    capabilities: ["credentials.write"],
    timeoutMs: 10_000,
  },
});

export const privilegedHandlers = definePrivilegedHandlers(privileged, {
  async readFinnhubApiKey() {
    const apiKey = await secrets.get({
      service: FINNHUB_SECRET_SERVICE,
      name: FINNHUB_SECRET_NAME,
    });
    return { apiKey };
  },
  async storeFinnhubApiKey({ apiKey }) {
    await secrets.set({
      service: FINNHUB_SECRET_SERVICE,
      name: FINNHUB_SECRET_NAME,
      value: apiKey,
    });
    return { ok: true };
  },
});
