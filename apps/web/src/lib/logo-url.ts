/** A logo link is written to the chain once, so what we accept is deliberately narrow. */
export const MAX_LOGO_URL_LENGTH = 200;

const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;

/** Shape only: https, a public-looking host name, no credentials, no query. Reachability is the proxy's job. */
export function isLogoUrl(value: string): boolean {
  if (value.length > MAX_LOGO_URL_LENGTH || /\s/.test(value)) {
    return false;
  }
  try {
    const url = new URL(value);
    const host = url.hostname;
    return (
      url.protocol === "https:" &&
      url.username === "" &&
      url.password === "" &&
      url.search === "" &&
      url.hash === "" &&
      !host.startsWith("[") &&
      !IPV4.test(host) &&
      host.includes(".") &&
      !host.endsWith(".local") &&
      !host.endsWith(".internal")
    );
  } catch {
    return false;
  }
}

export const logoSrc = (image: string) => `/api/logo?url=${encodeURIComponent(image)}`;
