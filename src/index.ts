interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
    anyOf?: Array<{ required: string[] }>;
    oneOf?: Array<{ required: string[] }>;
    allOf?: Array<{ required: string[] }>;
  };
  outputSchema?: Record<string, unknown>;
}

interface McpToolExport {
  tools: McpToolDefinition[];
  callTool: (name: string, args: Record<string, unknown>) => Promise<unknown>;
  meter?: { credits: number };
  cost?: Record<string, unknown>;
  provider?: string;
}

/**
 * One place to turn a failed `fetch` into an error a caller can act on.
 *
 * Nearly every pack was written the same way:
 *
 *     if (!res.ok) throw new Error(`Unsplash: ${res.status}`);
 *
 * which discards the response body — and the body is usually where the upstream
 * says what was actually wrong ("**symbol** not found: GBP", "parameter `year`
 * out of range", "unknown taxonomy id"). The caller gets a number, cannot
 * self-correct, and retries the same broken call. A 2026-07-31 sweep found this
 * shape in 481 of 1,400 packs, 47 of them PLATFORM-keyed.
 *
 * It also hides bugs one level down. Two of the first three packs audited had a
 * second defect that only existed because of this line: unsplash's rate-limit
 * branch sat BELOW a catch-all and was unreachable, and bea-gov parsed
 * `BEAAPI.Error.APIErrorDescription` below a `!res.ok` throw that made the
 * parsing dead code for every non-200.
 *
 * DELIBERATELY NOT A CLASSIFIER. It does not add `user_error:` /
 * `upstream_down:` prefixes. Those decide which tier a failure lands in, and the
 * `error` tier is what the daily problem-tools list is built from — it means
 * "Pipeworx has a defect". A 400 is genuinely ambiguous: often a caller's bad
 * argument, but sometimes a query WE built wrong (ted-eu comma-joined its CPV
 * values into something TED rejected, and that bug was found only because it sat
 * in `error`). Blanket-classifying 400s as caller mistakes would have hidden it.
 * A pack that KNOWS which it is should keep saying so explicitly; this helper is
 * for the 481 that say nothing at all.
 */

/** Longest upstream explanation we'll pass through. Enough for a real message,
 *  short enough that an HTML page or a stack trace can't swamp the error. */
const MAX_DETAIL = 300;

/**
 * Read the body of a failed response and fold it into a throwable Error.
 *
 * Usage — note the `await`, which is the one thing that makes this a mechanical
 * change rather than a drop-in:
 *
 *     if (!res.ok) throw await httpError(res, 'Unsplash');
 *
 * Safe to call on any non-ok response: a body that is missing, empty, unreadable
 * or HTML degrades to exactly the old `Name: 404` string rather than throwing
 * something new from inside the error path.
 */
async function httpError(res: Response, name: string): Promise<Error> {
  return new Error(`${name}: ${res.status}${detailSuffix(await readDetail(res))}`);
}

/** The message text without constructing an Error — for packs that need to wrap
 *  it in their own envelope or add an explicit classification prefix. */
async function httpErrorMessage(res: Response, name: string): Promise<string> {
  return `${name}: ${res.status}${detailSuffix(await readDetail(res))}`;
}

/**
 * Read a SUCCESSFUL response as JSON, failing loudly when it isn't JSON.
 *
 * `httpError` above only ever runs on `!res.ok`, which leaves the nastier half
 * of the problem unhandled: an upstream that answers **HTTP 200 with an HTML
 * page**. A bot wall, a login redirect, a maintenance interstitial and a CDN
 * error page are all 200s, so `res.ok` is true, and `res.json()` then throws
 * `Unexpected token '<', "<!DOCTYPE "... is not valid JSON`.
 *
 * That string is the problem. It names no upstream, carries no status, and
 * reads like a parser bug in Pipeworx — so it lands in the `error` tier, which
 * means "we have a defect", and the caller is told nothing they can act on.
 * data.govt.nz sat dead behind an Imperva challenge this way and every
 * status-code health check we own reported it green (7889a845). A zero-length
 * body has the same shape: `Unexpected end of JSON input`, seen this week on
 * uk-gazette (83% of external calls) and census.
 *
 * UNLIKE `httpError`, this one DOES classify, and the asymmetry is deliberate.
 * A 400 is genuinely ambiguous — often the caller's bad argument, sometimes a
 * query we built wrong — so blanket-classifying it would hide our own bugs.
 * There is no such ambiguity here: **no argument a caller can pass makes a JSON
 * API return an HTML page.** It is always the upstream, so `upstream_down:` is
 * a statement of fact rather than a guess, and it keeps these out of the
 * problem-tools list where they crowd out real defects.
 *
 *     const data = await parseJson<Feed>(res, 'UK Gazette');
 *
 * Call it only after the `!res.ok` check — on a failed response you want
 * `httpError`, which mines the body for the upstream's own explanation.
 */
async function parseJson<T>(res: Response, name: string): Promise<T> {
  let raw: string;
  try {
    raw = await res.text();
  } catch {
    throw new Error(
      `upstream_down: ${name} returned a body that could not be read (HTTP ${res.status}). ` +
        'The connection most likely dropped mid-response; retrying is reasonable.',
    );
  }

  const type = res.headers.get('content-type') ?? 'no content-type';

  if (!raw.trim()) {
    throw new Error(
      `upstream_down: ${name} answered HTTP ${res.status} with an EMPTY body where JSON was expected (${type}). ` +
        'Nothing about the request can cause this — it is an upstream fault, and the same call may well work on retry.',
    );
  }

  // Checked before parsing rather than in the catch, because knowing it is
  // markup is what turns "we failed to parse something" into "they served a
  // web page" — the second is diagnosable, the first is not.
  const head = raw.slice(0, 200).trimStart().toLowerCase();
  if (head.startsWith('<!doctype') || head.startsWith('<html') || head.startsWith('<?xml')) {
    throw new Error(
      `upstream_down: ${name} answered HTTP ${res.status} with an HTML page instead of JSON (${type}). ` +
        'That is typically a bot wall, a login redirect or a maintenance page — it is returned as a SUCCESS, ' +
        `so status-code health checks read it as fine. No argument change will get past it. First 120 chars: ${collapse(raw).slice(0, 120)}`,
    );
  }

  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new Error(
      `upstream_down: ${name} answered HTTP ${res.status} with a body that is not valid JSON (${type}). ` +
        `First 120 chars: ${collapse(raw).slice(0, 120)}`,
    );
  }
}

function detailSuffix(detail: string): string {
  return detail ? ` — ${detail}` : '';
}

async function readDetail(res: Response): Promise<string> {
  let raw: string;
  try {
    raw = await res.text();
  } catch {
    // Body already consumed, or the connection died mid-read. The status alone
    // is still worth throwing — never let the error path throw its own error.
    return '';
  }
  if (!raw) return '';

  // An HTML error page (Cloudflare interstitial, nginx default, a login
  // redirect) carries no API-level explanation, only markup that would crowd out
  // the status. Recognising it is worth more than stripping it: dropping it
  // keeps the message honest instead of filling it with `<!DOCTYPE html><html>`.
  const head = raw.slice(0, 200).trimStart().toLowerCase();
  if (head.startsWith('<!doctype html') || head.startsWith('<html') || head.startsWith('<?xml')) return '';

  // Most JSON error bodies bury one human sentence among ids and echoed request
  // params. Prefer that sentence; fall back to the whole body when the shape is
  // unfamiliar, since an unfamiliar shape is exactly when we can least afford to
  // guess wrong and show nothing.
  const fromJson = messageFromJson(raw);
  return collapse(fromJson ?? raw).slice(0, MAX_DETAIL);
}

/** The conventional "what went wrong" field, under any of the names upstreams
 *  actually use. Checked in order; first non-empty string wins. */
const MESSAGE_KEYS = [
  'message', 'error_message', 'errorMessage', 'detail', 'details',
  'description', 'error_description', 'reason', 'title', 'fault',
];

function messageFromJson(raw: string): string | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  return pickMessage(parsed, 0);
}

function pickMessage(node: unknown, depth: number): string | null {
  // Two levels covers `{error: {message}}` and `{errors: [{detail}]}`, the two
  // shapes that account for nearly all of them, without walking a large payload.
  if (depth > 2 || node == null) return null;

  if (typeof node === 'string') return node.trim() || null;

  if (Array.isArray(node)) {
    for (const item of node) {
      const found = pickMessage(item, depth + 1);
      if (found) return found;
    }
    return null;
  }

  if (typeof node !== 'object') return null;
  const obj = node as Record<string, unknown>;

  for (const key of MESSAGE_KEYS) {
    const v = obj[key];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  // `{error: …}` where error is itself an object or a string — the single most
  // common wrapper, so it is worth descending into by name rather than scanning
  // every key and risking picking up an echoed request parameter.
  for (const key of ['error', 'errors', 'fault', 'Error', 'data']) {
    if (key in obj) {
      const found = pickMessage(obj[key], depth + 1);
      if (found) return found;
    }
  }
  return null;
}

/** Errors are read in a single line of log output; newlines and runs of
 *  whitespace make a multi-line body unreadable there. */
function collapse(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}


/**
 * MHW MCP — Monster Hunter World data (mhw-db.com, free, no auth)
 *
 * Tools:
 * - get_monsters: List monsters with optional result limit
 * - get_weapons: List weapons, optionally filtered by weapon type
 * - get_armor: List armor pieces with optional result limit
 * - get_skills: List skills with optional result limit
 */


const BASE_URL = 'https://mhw-db.com';

const WEAPON_TYPES = [
  'great-sword',
  'sword-and-shield',
  'dual-blades',
  'long-sword',
  'hammer',
  'hunting-horn',
  'lance',
  'gunlance',
  'switch-axe',
  'charge-blade',
  'insect-glaive',
  'light-bowgun',
  'heavy-bowgun',
  'bow',
] as const;

type WeaponType = (typeof WEAPON_TYPES)[number];

const tools: McpToolExport['tools'] = [
  {
    name: 'get_monsters',
    description:
      'Search Monster Hunter World monsters by name, species, or size class. Returns species classification, elements, ailments, and weaknesses to plan hunts.',
    inputSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Filter by monster name (case-insensitive substring), e.g. "nergigante".',
        },
        species: {
          type: 'string',
          description:
            'Filter by species. One of: elder dragon, flying wyvern, brute wyvern, bird wyvern, fanged wyvern, piscine wyvern, fanged beast, neopteron, herbivore, wingdrake, relict, fish.',
        },
        type: {
          type: 'string',
          description: 'Size class: "large" (hunt targets) or "small" (ambient wildlife).',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of monsters to return. Defaults to 20.',
        },
      },
    },
  },
  {
    name: 'get_weapons',
    description:
      'Browse Monster Hunter World weapons by type (e.g., \'Great Sword\', \'Bow\', \'Hammer\'). Returns damage, elements, and rarity to match your playstyle.',
    inputSchema: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          description:
            'Filter by weapon type. One of: great-sword, sword-and-shield, dual-blades, long-sword, hammer, hunting-horn, lance, gunlance, switch-axe, charge-blade, insect-glaive, light-bowgun, heavy-bowgun, bow. Omit to return all types.',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of weapons to return. Defaults to 20.',
        },
      },
    },
  },
  {
    name: 'get_armor',
    description:
      'Find Monster Hunter World armor by rank and type. Returns defense, elemental resistances, and skill slots for building effective sets.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Maximum number of armor pieces to return. Defaults to 20.',
        },
      },
    },
  },
  {
    name: 'get_skills',
    description:
      'Look up Monster Hunter World skills by name. Returns descriptions, max ranks, and level-by-level effects to optimize your build.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Maximum number of skills to return. Defaults to 20.',
        },
      },
    },
  },
];

/**
 * The upstream `limit` is a plain head-of-list cut with no ordering guarantee,
 * so "which elder dragons are in the game?" used to return the first 20 records
 * — all small herbivores — and the answer came back "there are none". The whole
 * monster list is 58 records, so filter here instead of paging upstream.
 */
async function getMonsters(
  filters: { name?: string; species?: string; type?: string },
  limit: number,
): Promise<unknown> {
  const res = await fetch(`${BASE_URL}/monsters`);
  if (!res.ok) throw await httpError(res, 'MHW API error');
  const all = (await res.json()) as { name?: string; species?: string; type?: string }[];
  const name = filters.name?.trim().toLowerCase();
  const species = filters.species?.trim().toLowerCase();
  const type = filters.type?.trim().toLowerCase();
  const matched = all.filter(
    (m) =>
      (!name || (m.name ?? '').toLowerCase().includes(name)) &&
      (!species || (m.species ?? '').toLowerCase() === species) &&
      (!type || (m.type ?? '').toLowerCase() === type),
  );
  const items = matched.slice(0, limit);
  // `count` is the declared outputSchema's required field (items returned, after
  // the limit cut). The local-filter rewrite in dca624d5 dropped it, and the
  // Schema check has been red on every main commit since — total_matched and
  // total_monsters supplement `count`, they don't replace it.
  return { count: items.length, total_matched: matched.length, total_monsters: all.length, items };
}

async function getWeapons(type: WeaponType | undefined, limit: number): Promise<unknown> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (type) params.set('type', type);

  const res = await fetch(`${BASE_URL}/weapons?${params}`);
  if (!res.ok) throw await httpError(res, 'MHW API error');
  return res.json();
}

async function getArmor(limit: number): Promise<unknown> {
  const res = await fetch(`${BASE_URL}/armor?limit=${limit}`);
  if (!res.ok) throw await httpError(res, 'MHW API error');
  return res.json();
}

async function getSkills(limit: number): Promise<unknown> {
  const res = await fetch(`${BASE_URL}/skills?limit=${limit}`);
  if (!res.ok) throw await httpError(res, 'MHW API error');
  return res.json();
}

async function callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  switch (name) {
    case 'get_monsters':
      return getMonsters(
        {
          name: args.name as string | undefined,
          species: args.species as string | undefined,
          type: args.type as string | undefined,
        },
        (args.limit as number | undefined) ?? 20,
      );
    case 'get_weapons':
      return getWeapons(args.type as WeaponType | undefined, (args.limit as number | undefined) ?? 20);
    case 'get_armor':
      return getArmor((args.limit as number | undefined) ?? 20);
    case 'get_skills':
      return getSkills((args.limit as number | undefined) ?? 20);
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

export default { tools, callTool, meter: { credits: 2 } } satisfies McpToolExport;
