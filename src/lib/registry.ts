/**
 * Parsed channel address
 */
export interface ChannelAddress {
  /** Channel type: # for public, @ for DM */
  type: "#" | "@";
  /** Channel or persona name */
  name: string;
  /** Full original address for display */
  original: string;
}

/**
 * Parse a channel address
 *
 * Formats:
 * - @persona (DM channel)
 * - #channel (public channel)
 */
export function parseChannelAddress(address: string): ChannelAddress {
  if (!address.startsWith("#") && !address.startsWith("@")) {
    throw new Error(
      `Invalid channel address: ${address}. Must start with # or @`
    );
  }

  const type = address[0] as "#" | "@";
  const name = address.slice(1);

  if (!name) {
    throw new Error(
      `Invalid channel address: ${address}. Missing channel/persona name.`
    );
  }

  return { type, name, original: address };
}
