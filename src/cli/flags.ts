export type FlagValue = string | boolean | string[];
export type Flags = Record<string, FlagValue>;

export interface FlagSpec {
  name: string;
  type: 'string' | 'boolean' | 'array';
}

/**
 * Minimal argv parser. Always accepts --help (returns { help: true } immediately).
 * Throws on unknown flags or missing values.
 */
export function parseFlags(argv: string[], known: FlagSpec[]): Flags {
  const result: Flags = {};

  const knownMap = new Map<string, FlagSpec['type']>();
  for (const spec of known) {
    knownMap.set(spec.name, spec.type);
  }
  // --help is always valid
  knownMap.set('help', 'boolean');

  let i = 0;
  while (i < argv.length) {
    const token = argv[i];
    if (token === undefined) break;

    if (!token.startsWith('--')) {
      if (token === '-h') {
        return { help: true };
      }
      throw new Error(
        `Unexpected positional argument: ${token}. Use --help for usage, and pass values after named flags.`,
      );
    }

    const key = token.slice(2);

    if (key === 'help') {
      return { help: true };
    }

    const flagType = knownMap.get(key);
    if (flagType === undefined) {
      throw new Error(`Unknown flag: --${key}`);
    }

    if (flagType === 'boolean') {
      result[key] = true;
      i++;
      continue;
    }

    // string or array — consume next token as value
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--') || next === '-h') {
      throw new Error(`Flag --${key} requires a value`);
    }

    if (flagType === 'array') {
      const existing = result[key];
      if (Array.isArray(existing)) {
        existing.push(next);
      } else {
        result[key] = [next];
      }
    } else {
      result[key] = next;
    }

    i += 2;
  }

  return result;
}
