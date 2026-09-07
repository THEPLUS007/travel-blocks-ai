import { lookup } from 'node:dns/promises';
export interface LookupAddress { address: string; family: number }
import { BlockList, isIP } from 'node:net';
import http from 'node:http';
import https from 'node:https';
import { parse } from 'parse5';

export type SourceKind = 'text' | 'url' | 'youtube';
export interface ExtractedSource { title: string; content: string; canonicalUrl: string }
export interface SourceExtractor { supports(url: URL): boolean; extract(url: URL): Promise<ExtractedSource> }
export interface NormalizedSource { type: SourceKind; title: string; content: string; canonicalUrl?: string }
export type SourceErrorCode = 'SOURCE_INVALID' | 'SOURCE_UNSUPPORTED' | 'SOURCE_FETCH_TIMEOUT' | 'SOURCE_TOO_LARGE' | 'SOURCE_CONTENT_TYPE_UNSUPPORTED' | 'SOURCE_UNSAFE_URL' | 'SOURCE_EMPTY' | 'SOURCE_UNAVAILABLE';
export class SourcePipelineError extends Error {
  constructor(public code: SourceErrorCode, public retryable = false, cause?: unknown) { super(code, { cause }); this.name = 'SourcePipelineError'; }
}

const blockedV4 = new BlockList();
const blockedV6 = new BlockList();
for (const [network, prefix] of [['0.0.0.0',8],['10.0.0.0',8],['100.64.0.0',10],['127.0.0.0',8],['169.254.0.0',16],['172.16.0.0',12],['192.0.0.0',24],['192.0.2.0',24],['192.168.0.0',16],['198.18.0.0',15],['198.51.100.0',24],['203.0.113.0',24],['224.0.0.0',4],['240.0.0.0',4]] as const) blockedV4.addSubnet(network, prefix, 'ipv4');
for (const [network, prefix] of [['::',128],['::ffff:0:0',96],['::1',128],['100::',64],['2001:db8::',32],['fc00::',7],['fe80::',10],['ff00::',8]] as const) blockedV6.addSubnet(network, prefix, 'ipv6');

function normalizeMappedIpv4(address: string): string {
  const match = address.toLowerCase().match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  return match?.[1] ?? address;
}
export function isPublicAddress(address: string): boolean {
  const normalized = normalizeMappedIpv4(address);
  const family = isIP(normalized);
  return family === 4 ? !blockedV4.check(normalized, 'ipv4') : family === 6 ? !blockedV6.check(normalized, 'ipv6') : false;
}
export function classifySource(input: string): { type: SourceKind; url?: URL } {
  const value = input.trim();
  if (!value) throw new SourcePipelineError('SOURCE_EMPTY');
  let url: URL | undefined;
  try { url = new URL(value); } catch {
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) throw new SourcePipelineError('SOURCE_INVALID');
    return { type: 'text' };
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new SourcePipelineError('SOURCE_INVALID');
  const host = url.hostname.toLowerCase().replace(/\.$/, '');
  if (host === 'youtu.be' || host === 'youtube.com' || host.endsWith('.youtube.com')) return { type: 'youtube', url };
  return { type: 'url', url };
}

export type Resolver = (hostname: string) => Promise<LookupAddress[]>;
export async function resolvePublicAddress(url: URL, resolver: Resolver = (hostname) => lookup(hostname, { all: true, verbatim: true })): Promise<LookupAddress> {
  const rawHostname = url.hostname.toLowerCase().replace(/\.$/, '');
  const hostname = rawHostname.startsWith('[') && rawHostname.endsWith(']') ? rawHostname.slice(1, -1) : rawHostname;
  if (hostname === 'localhost' || hostname.endsWith('.localhost')) throw new SourcePipelineError('SOURCE_UNSAFE_URL');
  const literalFamily = isIP(hostname);
  const addresses = literalFamily ? [{ address: hostname, family: literalFamily }] : await resolver(hostname).catch((error) => { throw new SourcePipelineError('SOURCE_UNAVAILABLE', true, error); });
  if (!addresses.length || addresses.some(({ address }) => !isPublicAddress(address))) throw new SourcePipelineError('SOURCE_UNSAFE_URL');
  return addresses[0];
}

export interface TransportResponse { status: number; headers: Record<string, string | string[] | undefined>; body: AsyncIterable<Uint8Array> }
export type Transport = (url: URL, address: LookupAddress, signal: AbortSignal) => Promise<TransportResponse>;
const nodeTransport: Transport = (url, address, signal) => new Promise((resolve, reject) => {
  const client = url.protocol === 'https:' ? https : http;
  const request = client.request(url, {
    method: 'GET', signal, headers: { accept: 'text/html,text/plain;q=0.9', 'user-agent': 'TravelBlocksAI/1.0' },
    lookup: (_hostname, _options, callback) => callback(null, address.address, address.family),
  }, (response) => resolve({ status: response.statusCode ?? 0, headers: response.headers, body: response }));
  request.on('error', reject);
  request.end();
});

export interface SafeHttpExtractorOptions { timeoutMs?: number; maxBytes?: number; maxContentChars?: number; maxRedirects?: number; resolver?: Resolver; transport?: Transport }
export class SafeHttpSourceExtractor implements SourceExtractor {
  private readonly timeoutMs: number; private readonly maxBytes: number; private readonly maxContentChars: number; private readonly maxRedirects: number; private readonly resolver: Resolver; private readonly transport: Transport;
  constructor(options: SafeHttpExtractorOptions = {}) { this.timeoutMs=options.timeoutMs??10_000;this.maxBytes=options.maxBytes??256*1024;this.maxContentChars=options.maxContentChars??12_000;this.maxRedirects=options.maxRedirects??3;this.resolver=options.resolver??((host)=>lookup(host,{all:true,verbatim:true}));this.transport=options.transport??nodeTransport; }
  supports(url: URL) { return ['http:', 'https:'].includes(url.protocol); }
  async extract(initialUrl: URL): Promise<ExtractedSource> {
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), this.timeoutMs); const visited = new Set<string>();
    try {
      let url = initialUrl;
      for (let redirects=0; redirects<=this.maxRedirects; redirects++) {
        if (visited.has(url.href)) throw new SourcePipelineError('SOURCE_UNAVAILABLE'); visited.add(url.href);
        const address = await resolvePublicAddress(url, this.resolver);
        const response = await this.transport(url, address, controller.signal);
        if ([301,302,303,307,308].includes(response.status)) {
          const location = header(response.headers, 'location');
          if (!location || redirects === this.maxRedirects) throw new SourcePipelineError('SOURCE_UNAVAILABLE');
          const next = new URL(location, url);
          const redirectedSource = classifySource(next.href);
          if (redirectedSource.type === 'youtube') throw new SourcePipelineError('SOURCE_UNSUPPORTED');
          if (redirectedSource.type !== 'url') throw new SourcePipelineError('SOURCE_INVALID');
          url = next;
          continue;
        }
        if (response.status < 200 || response.status >= 300) throw new SourcePipelineError('SOURCE_UNAVAILABLE', response.status >= 500);
        const contentType = (header(response.headers, 'content-type') ?? '').split(';')[0].trim().toLowerCase();
        if (!['text/html','text/plain'].includes(contentType)) throw new SourcePipelineError('SOURCE_CONTENT_TYPE_UNSUPPORTED');
        const declared = Number(header(response.headers, 'content-length'));
        if (Number.isFinite(declared) && declared > this.maxBytes) throw new SourcePipelineError('SOURCE_TOO_LARGE');
        const raw = await readLimited(response.body, this.maxBytes);
        const extracted = contentType === 'text/html' ? extractHtml(raw) : { title: '', content: raw };
        const content = normalizeContent(extracted.content, this.maxContentChars);
        return { title: extracted.title || url.hostname, content, canonicalUrl: url.href };
      }
      throw new SourcePipelineError('SOURCE_UNAVAILABLE');
    } catch (error) {
      if (error instanceof SourcePipelineError) throw error;
      if (error instanceof Error && error.name === 'AbortError') throw new SourcePipelineError('SOURCE_FETCH_TIMEOUT', true, error);
      throw new SourcePipelineError('SOURCE_UNAVAILABLE', true, error);
    } finally { clearTimeout(timer); }
  }
}
function header(headers: TransportResponse['headers'], name: string): string | undefined { const value=headers[name];return Array.isArray(value)?value[0]:value; }
async function readLimited(body: AsyncIterable<Uint8Array>, maxBytes: number): Promise<string> { const chunks:Buffer[]=[];let size=0;for await(const chunk of body){size+=chunk.byteLength;if(size>maxBytes)throw new SourcePipelineError('SOURCE_TOO_LARGE');chunks.push(Buffer.from(chunk));}return Buffer.concat(chunks).toString('utf8'); }
function normalizeContent(value: string, maxChars=12_000): string { const content=value.replace(/\s+/g,' ').trim();if(!content)throw new SourcePipelineError('SOURCE_EMPTY');return content.slice(0,maxChars); }
function extractHtml(html: string): {title:string;content:string} { const document=parse(html) as any;const ignored=new Set(['script','style','noscript','nav','svg']);let title='';const pieces:string[]=[];const walk=(node:any,skip=false)=>{const tag=String(node.tagName??'').toLowerCase();const nextSkip=skip||ignored.has(tag);if(tag==='title'&&!title)title=textOf(node);if(node.nodeName==='#text'&&!nextSkip)pieces.push(String(node.value??''));for(const child of node.childNodes??[])walk(child,nextSkip);};walk(document);return {title:normalizeOptional(title),content:pieces.join(' ')}; }
function textOf(node:any):string{return (node.childNodes??[]).map((child:any)=>child.nodeName==='#text'?String(child.value??''):textOf(child)).join(' ')}
function normalizeOptional(value:string){return value.replace(/\s+/g,' ').trim().slice(0,200)}

export class TravelSourcePipeline {
  constructor(private readonly httpExtractor: SourceExtractor = new SafeHttpSourceExtractor()) {}
  async process(input: string): Promise<NormalizedSource> {
    const source=classifySource(input);
    if(source.type==='text')return {type:'text',title:'User text',content:normalizeContent(input)};
    if(source.type==='youtube')throw new SourcePipelineError('SOURCE_UNSUPPORTED');
    if(!source.url||!this.httpExtractor.supports(source.url))throw new SourcePipelineError('SOURCE_UNSUPPORTED');
    return {type:'url',...(await this.httpExtractor.extract(source.url))};
  }
}
