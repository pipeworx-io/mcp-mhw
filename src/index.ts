/**
 * MHW MCP — Monster Hunter World data (mhw-db.com, free, no auth)
 *
 * Tools:
 * - get_monsters: List monsters with optional result limit
 * - get_weapons: List weapons, optionally filtered by weapon type
 * - get_armor: List armor pieces with optional result limit
 * - get_skills: List skills with optional result limit
 */

interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

interface McpToolExport {
  tools: McpToolDefinition[];
  callTool: (name: string, args: Record<string, unknown>) => Promise<unknown>;
}

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
      'List monsters from Monster Hunter World, including their type, species, elements, ailments, and weaknesses.',
    inputSchema: {
      type: 'object',
      properties: {
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
      'List weapons from Monster Hunter World. Optionally filter by weapon type to narrow results.',
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
      'List armor pieces from Monster Hunter World, including their type, rank, defense, resistances, and slots.',
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
      'List skills from Monster Hunter World, including their descriptions and rank-level details.',
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

async function getMonsters(limit: number): Promise<unknown> {
  const res = await fetch(`${BASE_URL}/monsters?limit=${limit}`);
  if (!res.ok) throw new Error(`MHW API error: ${res.status}`);
  return res.json();
}

async function getWeapons(type: WeaponType | undefined, limit: number): Promise<unknown> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (type) params.set('type', type);

  const res = await fetch(`${BASE_URL}/weapons?${params}`);
  if (!res.ok) throw new Error(`MHW API error: ${res.status}`);
  return res.json();
}

async function getArmor(limit: number): Promise<unknown> {
  const res = await fetch(`${BASE_URL}/armor?limit=${limit}`);
  if (!res.ok) throw new Error(`MHW API error: ${res.status}`);
  return res.json();
}

async function getSkills(limit: number): Promise<unknown> {
  const res = await fetch(`${BASE_URL}/skills?limit=${limit}`);
  if (!res.ok) throw new Error(`MHW API error: ${res.status}`);
  return res.json();
}

async function callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  switch (name) {
    case 'get_monsters':
      return getMonsters((args.limit as number | undefined) ?? 20);
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

export default { tools, callTool } satisfies McpToolExport;
