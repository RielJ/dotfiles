/**
 * Direct HTTP fetch for web_read, with an SSRF guard. No pi imports, so tests can run it.
 *
 * Jina and Exa fetch pages from their own servers, so they cannot reach this machine's
 * network. A direct fetch can, so every hop is checked against a deny-set of addresses
 * that are never a public web page: loopback, private ranges, link-local (including the
 * 169.254.169.254 cloud-metadata endpoint), CGNAT, and IPv6 forms that embed any of them.
 * The deny-set is ported from Obscura's `obscura-ssrf` crate.
 *
 * The check runs inside the socket's DNS lookup, so the address that is checked is the
 * address that is connected to (no DNS-rebinding gap). Redirects are followed by hand so
 * each hop is checked again.
 */

import { type LookupAddress, lookup as dnsLookup } from "node:dns";
import http from "node:http";
import https from "node:https";
import { isIP, type LookupFunction } from "node:net";
import type { Readable } from "node:stream";
import zlib from "node:zlib";

/** Set to 1/true/yes/on to let web_read reach private and local addresses. */
export const ALLOW_PRIVATE_ENV = "PI_WEB_ALLOW_PRIVATE_NETWORK";

export function envAllowsPrivateNetwork(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return /^(1|true|yes|on)$/i.test((env[ALLOW_PRIVATE_ENV] ?? "").trim());
}

export class BlockedUrlError extends Error {
  override name = "BlockedUrlError";
}

function parseIPv4(s: string): number[] | null {
  if (isIP(s) !== 4) return null;
  return s.split(".").map(Number);
}

/** Expands an IPv6 literal (brackets, zone id and embedded IPv4 allowed) into 8 segments. */
function parseIPv6(input: string): number[] | null {
  let s = input
    .replace(/^\[|\]$/g, "")
    .split("%")[0]
    .toLowerCase();
  if (isIP(s) !== 6) return null;
  const v4 = s.match(/(\d+\.\d+\.\d+\.\d+)$/);
  if (v4) {
    const o = v4[1].split(".").map(Number);
    s = `${s.slice(0, -v4[1].length)}${((o[0] << 8) | o[1]).toString(16)}:${((o[2] << 8) | o[3]).toString(16)}`;
  }
  const halves = s.split("::");
  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves.length > 1 && halves[1] ? halves[1].split(":") : [];
  const parts =
    halves.length > 1
      ? [
          ...head,
          ...Array<string>(8 - head.length - tail.length).fill("0"),
          ...tail,
        ]
      : head;
  return parts.length === 8 ? parts.map((p) => Number.parseInt(p, 16)) : null;
}

function isForbiddenV4([a, b, c, d]: number[]): boolean {
  return (
    a === 0 || // "this network"; 0.0.0.0 routes to localhost
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) || // link-local, cloud metadata
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127) || // CGNAT; Alibaba metadata 100.100.100.200
    (a === 198 && (b === 18 || b === 19)) || // benchmarking
    (a === 192 && b === 88 && c === 99) || // 6to4 relay anycast
    (a === 192 && b === 0 && c === 0 && d !== 9 && d !== 10) || // special purpose, except the PCP anycasts
    (a === 192 && b === 0 && c === 2) || // documentation
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113) ||
    a >= 224 // multicast, reserved, broadcast
  );
}

function v4From(hi: number, lo: number): number[] {
  return [hi >> 8, hi & 0xff, lo >> 8, lo & 0xff];
}

function isForbiddenV6(s: number[]): boolean {
  const zeros = (from: number, to: number) =>
    s.slice(from, to).every((x) => x === 0);
  if (zeros(0, 8)) return true; // ::
  if (zeros(0, 7) && s[7] === 1) return true; // ::1
  if ((s[0] & 0xfe00) === 0xfc00) return true; // unique local fc00::/7
  if ((s[0] & 0xffc0) === 0xfe80) return true; // link-local fe80::/10
  if ((s[0] & 0xff00) === 0xff00) return true; // multicast
  if (zeros(0, 5) && (s[5] === 0xffff || s[5] === 0))
    return isForbiddenV4(v4From(s[6], s[7])); // mapped / compatible
  if (s[0] === 0x64 && s[1] === 0xff9b && zeros(2, 6))
    return isForbiddenV4(v4From(s[6], s[7])); // NAT64 /96
  if (s[0] === 0x2002) return isForbiddenV4(v4From(s[1], s[2])); // 6to4
  if (s[0] === 0x2001 && s[1] === 0) {
    // Teredo: server IPv4 in bits 32..64, client IPv4 bit-inverted in the last 32 bits.
    return (
      isForbiddenV4(v4From(s[2], s[3])) ||
      isForbiddenV4(v4From(~s[6] & 0xffff, ~s[7] & 0xffff))
    );
  }
  return (
    (s[0] === 0x100 && zeros(1, 4)) || // discard-only
    (s[0] === 0x64 && s[1] === 0xff9b && s[2] === 1) || // local-use NAT64
    (s[0] === 0x2001 && s[1] === 0xdb8) || // documentation
    (s[0] === 0x3fff && (s[1] & 0xf000) === 0)
  );
}

/** True when an IP literal must never be the target of a direct fetch. Non-IP strings are forbidden. */
export function isForbiddenIp(ip: string): boolean {
  const v4 = parseIPv4(ip);
  if (v4) return isForbiddenV4(v4);
  const v6 = parseIPv6(ip);
  return v6 ? isForbiddenV6(v6) : true;
}

/** Prefixes a bare host or path with https:// (from kernel/browser-loop's normalizeGotoUrl). */
export function normalizeUrl(value: string): string {
  const url = value.trim();
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(url) ? url : `https://${url}`;
}

function guardedLookup(isForbidden: (ip: string) => boolean): LookupFunction {
  return (hostname, options, callback) => {
    dnsLookup(
      hostname,
      { ...options, all: true },
      (err, addresses: LookupAddress[]) => {
        if (err) return callback(err, "", 0);
        const bad = addresses.find((a) => isForbidden(a.address));
        if (bad || addresses.length === 0) {
          const blocked = new BlockedUrlError(
            `${hostname} resolves to ${bad?.address ?? "nothing"}, a private or local address`,
          );
          return callback(blocked, "", 0);
        }
        if (options.all) return callback(null, addresses);
        return callback(null, addresses[0].address, addresses[0].family);
      },
    );
  };
}

const TEXT_TYPE =
  /^(text\/|application\/(xhtml\+xml|xml|json|ld\+json|javascript|rss\+xml|atom\+xml))|\+xml$|\+json$/i;

export interface DirectFetchOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
  /** Cap on decoded body bytes; the rest is dropped and `truncated` is set. */
  maxBytes?: number;
  maxRedirects?: number;
  /** Returns true for addresses that must not be reached. Default: isForbiddenIp, or nothing when the env opt-in is set. */
  isForbidden?: (ip: string) => boolean;
  userAgent?: string;
}

export interface DirectResponse {
  /** Final URL after redirects. */
  url: string;
  status: number;
  contentType: string;
  /** Decoded body for text content types; null for binary (PDF, images), which is not downloaded. */
  text: string | null;
  truncated: boolean;
}

const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36";

function decodeBody(buf: Buffer, contentType: string): string {
  const declared =
    contentType.match(/charset=["']?([\w-]+)/i)?.[1] ??
    buf
      .subarray(0, 2048)
      .toString("latin1")
      .match(/<meta[^>]+charset=["']?([\w-]+)/i)?.[1] ??
    "utf-8";
  try {
    return new TextDecoder(declared).decode(buf);
  } catch {
    return new TextDecoder("utf-8").decode(buf);
  }
}

function decompress(res: http.IncomingMessage): Readable {
  switch ((res.headers["content-encoding"] ?? "").toLowerCase()) {
    case "gzip":
    case "x-gzip":
      return res.pipe(zlib.createGunzip());
    case "deflate":
      return res.pipe(zlib.createInflate());
    case "br":
      return res.pipe(zlib.createBrotliDecompress());
    default:
      return res;
  }
}

/** Parses a URL, throwing an error that names the bad input instead of a bare TypeError. */
function parseUrl(value: string, base?: URL): URL {
  try {
    return new URL(value, base);
  } catch {
    throw new Error(`not a valid URL: ${JSON.stringify(value.slice(0, 200))}`);
  }
}

type Hop =
  | { kind: "redirect"; location: string }
  | { kind: "done"; response: DirectResponse };

function requestOnce(
  url: URL,
  opts: Required<Omit<DirectFetchOptions, "signal">> & { signal: AbortSignal },
): Promise<Hop> {
  const transport = url.protocol === "https:" ? https : http;
  return new Promise((resolve, reject) => {
    const req = transport.request(
      url,
      {
        method: "GET",
        signal: opts.signal,
        lookup: guardedLookup(opts.isForbidden),
        headers: {
          "User-Agent": opts.userAgent,
          Accept: "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.8",
          "Accept-Encoding": "gzip, deflate, br",
          "Accept-Language": "en-US,en;q=0.9",
        },
      },
      (res) => {
        const status = res.statusCode ?? 0;
        const location = res.headers.location;
        if (status >= 300 && status < 400 && location) {
          res.resume();
          return resolve({ kind: "redirect", location });
        }
        const contentType = String(res.headers["content-type"] ?? "");
        if (contentType && !TEXT_TYPE.test(contentType)) {
          res.destroy();
          return resolve({
            kind: "done",
            response: {
              url: url.href,
              status,
              contentType,
              text: null,
              truncated: false,
            },
          });
        }
        const body = decompress(res);
        const chunks: Buffer[] = [];
        let size = 0;
        let truncated = false;
        const finish = () =>
          resolve({
            kind: "done",
            response: {
              url: url.href,
              status,
              contentType,
              text: decodeBody(Buffer.concat(chunks), contentType),
              truncated,
            },
          });
        body.on("data", (chunk: Buffer) => {
          if (truncated) return;
          const room = opts.maxBytes - size;
          chunks.push(chunk.length > room ? chunk.subarray(0, room) : chunk);
          size += Math.min(chunk.length, room);
          if (chunk.length >= room) {
            truncated = true;
            res.destroy();
            finish();
          }
        });
        body.on("end", () => {
          if (!truncated) finish();
        });
        body.on("error", (err) => {
          if (!truncated) reject(err);
        });
      },
    );
    req.on("error", reject);
    req.end();
  });
}

/**
 * GETs a URL directly. Throws BlockedUrlError for non-http(s) URLs and private or local
 * addresses (checked on every redirect hop), and a plain Error on network failure,
 * timeout, or too many redirects. Non-2xx responses are returned, not thrown.
 */
export async function fetchDirect(
  rawUrl: string,
  options: DirectFetchOptions = {},
): Promise<DirectResponse> {
  const timeout = AbortSignal.timeout(options.timeoutMs ?? 20_000);
  const opts = {
    timeoutMs: options.timeoutMs ?? 20_000,
    maxBytes: options.maxBytes ?? 5_000_000,
    maxRedirects: options.maxRedirects ?? 5,
    isForbidden:
      options.isForbidden ??
      (envAllowsPrivateNetwork() ? () => false : isForbiddenIp),
    userAgent: options.userAgent ?? BROWSER_UA,
    signal: options.signal
      ? AbortSignal.any([options.signal, timeout])
      : timeout,
  };
  let url = parseUrl(rawUrl);
  for (let hop = 0; ; hop++) {
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new BlockedUrlError(
        `only http and https URLs can be read, not ${url.protocol}`,
      );
    }
    const host = url.hostname.replace(/^\[|\]$/g, "");
    if (isIP(host) && opts.isForbidden(host))
      throw new BlockedUrlError(`${host} is a private or local address`);
    const result = await requestOnce(url, opts);
    if (result.kind === "done") return result.response;
    if (hop >= opts.maxRedirects)
      throw new Error(`more than ${opts.maxRedirects} redirects`);
    url = parseUrl(result.location, url);
  }
}
