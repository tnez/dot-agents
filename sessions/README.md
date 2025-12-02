# Sessions

This directory contains execution logs for workflow runs.

## Structure

```text
sessions/
├── 20251202-093045.log
├── 20251202-140000.log
└── README.md
```

**Filename format:** `{YYYYMMDD}-{HHMMSS}.log`

## Log Contents

Each `.log` file contains:

- Run ID, workflow name, and persona
- Start/end timestamps and duration
- Exit code and success status
- Full stdout/stderr output
- Error details (if failed)

## Cleanup

Session logs are excluded from git. You can safely delete old logs:

```shell
# Delete logs older than 7 days
find sessions -name "*.log" -mtime +7 -delete
```
