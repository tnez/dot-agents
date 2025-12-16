/**
 * Trigger-specific input overrides
 */
export interface TriggerInputOverride {
  [inputName: string]: string | number | boolean;
}

/**
 * Schedule trigger - cron-based execution
 */
export interface ScheduleTrigger {
  /** Cron expression (e.g., "0 9 * * 1-5") */
  cron: string;
  /** Optional input overrides for this schedule */
  inputs?: TriggerInputOverride;
}

/**
 * Manual trigger configuration (equivalent to workflow_dispatch)
 */
export interface ManualTrigger {
  /** Additional inputs specific to manual invocation */
  inputs?: Record<
    string,
    {
      description?: string;
      default?: string | number | boolean;
      required?: boolean;
    }
  >;
}

/**
 * File change trigger - watch for filesystem changes
 */
export interface FileChangeTrigger {
  /** Glob patterns to watch (supports ! negation) */
  paths: string[];
  /** Event types to trigger on */
  events?: ("modify" | "create" | "delete")[];
}

/**
 * Webhook trigger - HTTP endpoint
 */
export interface WebhookTrigger {
  /** URL path for the webhook endpoint */
  path: string;
  /** Secret for validation (supports ${VAR} expansion) */
  secret?: string;
}

/**
 * Workflow completion trigger - run after another workflow
 */
export interface WorkflowCompleteTrigger {
  /** Name of workflow to watch */
  workflow: string;
  /** Status conditions to trigger on */
  status?: ("success" | "failure" | "any")[];
}

/**
 * Git event trigger
 */
export interface GitTrigger {
  /** Git events to trigger on */
  events: ("post-commit" | "post-merge" | "pre-push")[];
  /** Branch filter */
  branches?: string[];
}

/**
 * GitHub event trigger
 */
export interface GitHubTrigger {
  /** GitHub event types */
  events: ("pull_request" | "issues" | "push" | "release")[];
  /** Activity types within the event */
  types?: string[];
  /** Additional filters */
  filters?: {
    branches?: string[];
    labels?: string[];
  };
}

/**
 * Channel message trigger - run workflow when message posted to a channel
 */
export interface ChannelTrigger {
  /** Channel name to watch (e.g., "#issues", "#requests") */
  channel: string;
  /** Optional input overrides for channel-triggered runs */
  inputs?: TriggerInputOverride;
}

/**
 * All workflow triggers
 */
export interface WorkflowTriggers {
  /** Cron-based schedules */
  schedule?: ScheduleTrigger[];
  /** Manual/on-demand trigger */
  manual?: boolean | ManualTrigger;
  /** File system change trigger */
  file_change?: FileChangeTrigger;
  /** Webhook trigger */
  webhook?: WebhookTrigger;
  /** Workflow completion trigger */
  workflow_complete?: WorkflowCompleteTrigger;
  /** Git event trigger */
  git?: GitTrigger;
  /** GitHub event trigger */
  github?: GitHubTrigger;
  /** Channel message trigger */
  channel?: ChannelTrigger;
}
