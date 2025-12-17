/**
 * Channel metadata stored in _metadata.yaml
 */
export interface ChannelMetadata {
  /** Channel name (without # or @ prefix) */
  name: string;
  /** Description of the channel's purpose */
  description?: string;
  /** Who created the channel */
  created_by: string;
  /** When the channel was created */
  created_at: string;
}

/**
 * Message frontmatter
 */
export interface ChannelMessageMeta {
  /** Who sent the message (e.g., workflow/process-inbox, @tnez) */
  from?: string;
  /** Hostname where the message originated */
  host?: string;
  /** Unique run identifier if from a workflow */
  run_id?: string;
  /** Tags for categorization */
  tags?: string[];
}

/**
 * A message in a channel
 */
export interface ChannelMessage {
  /** Message ID (ISO 8601 timestamp) */
  id: string;
  /** Message content (markdown) */
  content: string;
  /** Message metadata */
  meta: ChannelMessageMeta;
  /** Thread replies (ISO timestamps -> content) */
  replies?: ChannelReply[];
}

/**
 * A reply in a thread
 */
export interface ChannelReply {
  /** Reply ID (ISO 8601 timestamp) */
  id: string;
  /** Reply content (markdown) */
  content: string;
  /** Reply metadata */
  meta: ChannelMessageMeta;
}

/**
 * Channel with its metadata and messages
 */
export interface Channel {
  /** Full channel name including prefix (e.g., #status, @persona) */
  name: string;
  /** Channel metadata */
  metadata: ChannelMetadata;
  /** Messages in the channel */
  messages: ChannelMessage[];
}
