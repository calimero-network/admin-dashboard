import {
  getAppEndpointKey,
  getAccessToken,
} from '@calimero-network/calimero-client';

/**
 * The application's embedded WASM ABI, served by
 * `GET /admin-api/applications/:id/abi`.
 *
 * We read it for one reason: creating a context RUNS the app's `init`, with
 * whatever initialization params the caller supplied. If they do not match
 * `init`'s signature the call traps inside the WASM, and core answers a bare
 * `500 {"error":"Internal server error"}` — it deliberately does not echo
 * untyped internal errors, so the caller is told nothing at all. (Verified
 * against merod 0.11.0-rc.20: the real cause is only in the node's log, and
 * even there the message came through empty.)
 *
 * So the fix is to not get it wrong: the ABI says exactly what `init` takes,
 * and the create-context form is generated from it.
 *
 * Shapes mirror core's `crates/wasm-abi/src/schema.rs` (`Manifest`, `Method`,
 * `Parameter`, `TypeRef`), which is snake_case on the wire — unlike the
 * camelCase admin API around it.
 */

/** A `$ref` to a named type, or an inline `{ kind: … }` type. */
export type AbiTypeRef =
  | { $ref: string }
  | { kind: string; [key: string]: unknown };

export interface AbiParameter {
  name: string;
  type: AbiTypeRef;
  nullable?: boolean;
}

export interface AbiMethod {
  name: string;
  params: AbiParameter[];
  returns?: AbiTypeRef;
}

export interface AbiVariant {
  name: string;
  payload?: AbiTypeRef;
}

export interface AbiTypeDef {
  kind: 'record' | 'variant' | string;
  fields?: AbiParameter[];
  variants?: AbiVariant[];
}

export interface AbiManifest {
  schema_version: string;
  types: Record<string, AbiTypeDef>;
  methods: AbiMethod[];
}

export async function getApplicationAbi(
  applicationId: string,
  serviceName?: string,
): Promise<AbiManifest | null> {
  const token = getAccessToken();
  const base = getAppEndpointKey() ?? '';
  const query = serviceName
    ? `?service_name=${encodeURIComponent(serviceName)}`
    : '';
  const res = await fetch(
    `${base}/admin-api/applications/${applicationId}/abi${query}`,
    { headers: token ? { Authorization: `Bearer ${token}` } : {} },
  );
  // A raw-wasm app (or one built without `cargo mero build`) has no embedded
  // ABI. That is not an error — the form falls back to a raw JSON editor.
  if (!res.ok) return null;
  const json = await res.json();
  const manifest = (json?.data ?? json) as AbiManifest | null;
  return manifest && Array.isArray(manifest.methods) ? manifest : null;
}

export function findInit(abi: AbiManifest | null): AbiMethod | null {
  return abi?.methods.find((m) => m.name === 'init') ?? null;
}

function refName(type: AbiTypeRef): string | null {
  return '$ref' in type ? (type.$ref as string) : null;
}

function kindOf(type: AbiTypeRef): string | null {
  return '$ref' in type ? null : type.kind;
}

const INTEGER_KINDS = new Set([
  'u8',
  'u16',
  'u32',
  'u64',
  'i8',
  'i16',
  'i32',
  'i64',
]);
const FLOAT_KINDS = new Set(['f32', 'f64']);

/**
 * A variant type whose every case is a bare name (no payload) is just an enum,
 * so it can be a `<select>`. Anything richer falls back to JSON.
 */
export function unitVariantOptions(
  type: AbiTypeRef,
  types: Record<string, AbiTypeDef>,
): string[] | null {
  const name = refName(type);
  if (!name) return null;
  const def = types[name];
  if (def?.kind !== 'variant' || !def.variants?.length) return null;
  if (def.variants.some((v) => v.payload)) return null;
  return def.variants.map((v) => v.name);
}

/** How a param should be edited. */
export type FieldControl =
  | 'text'
  | 'integer'
  | 'float'
  | 'boolean'
  | 'enum'
  | 'json';

export function controlFor(
  type: AbiTypeRef,
  types: Record<string, AbiTypeDef>,
): FieldControl {
  if (unitVariantOptions(type, types)) return 'enum';
  const kind = kindOf(type);
  if (kind === 'string') return 'text';
  if (kind === 'bool') return 'boolean';
  if (kind && INTEGER_KINDS.has(kind)) return 'integer';
  if (kind && FLOAT_KINDS.has(kind)) return 'float';
  // Records, lists, maps, bytes, nested refs — no sensible single input, so
  // the user edits JSON for that one field.
  return 'json';
}

/** A short human label for the param, e.g. `string`, `u64`, `Channel | Dm`. */
export function describeType(
  type: AbiTypeRef,
  types: Record<string, AbiTypeDef>,
): string {
  const options = unitVariantOptions(type, types);
  if (options) return options.join(' | ');
  const name = refName(type);
  if (name) return name;
  const kind = kindOf(type) ?? 'unknown';
  if (kind === 'list') return 'list';
  if (kind === 'map') return 'map';
  return kind;
}

/** A starting value that is at least the right JSON type. */
export function defaultValueFor(
  type: AbiTypeRef,
  types: Record<string, AbiTypeDef>,
): unknown {
  const options = unitVariantOptions(type, types);
  if (options) return options[0];
  const kind = kindOf(type);
  if (kind === 'bool') return false;
  if (kind && (INTEGER_KINDS.has(kind) || FLOAT_KINDS.has(kind))) return 0;
  if (kind === 'string') return '';
  if (kind === 'list') return [];
  const name = refName(type);
  if (name && types[name]?.kind === 'record') return {};
  return null;
}

/** `init(name: string, context_type: Channel | Dm, …)`, for display. */
export function describeInit(
  init: AbiMethod,
  types: Record<string, AbiTypeDef>,
): string {
  const params = init.params
    .map(
      (p) =>
        `${p.name}: ${describeType(p.type, types)}${p.nullable ? '?' : ''}`,
    )
    .join(', ');
  return `init(${params})`;
}
