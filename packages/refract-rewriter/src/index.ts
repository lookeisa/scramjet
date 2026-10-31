import { RefractError } from "@refractjs/refract-shared";

const nonNetworkSchemes = /^(?:data|javascript|mailto|tel|blob|about):/i;

export class RefractRewriter {
  resolveUrl(input: string, baseUrl?: string): string {
    const value = input.trim();
    if (!value || value.startsWith("#") || nonNetworkSchemes.test(value)) return value;

    try {
      const resolved = baseUrl ? new URL(value, baseUrl) : new URL(value);
      if (resolved.protocol !== "http:" && resolved.protocol !== "https:") {
        throw new RefractError("REFRACT_E_INVALID_URL", "Only HTTP and HTTPS URLs are supported");
      }
      return resolved.href;
    } catch (error) {
      if (error instanceof RefractError) throw error;
      throw new RefractError("REFRACT_E_INVALID_URL", "Could not resolve request URL", { cause: error });
    }
  }
}
