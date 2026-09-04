#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
prompt="$(<"${project_dir}/docs/claude-adversarial-review.txt")"

cd "${project_dir}"
exec claude -p \
  --no-session-persistence \
  --permission-mode dontAsk \
  --allowedTools Read,Glob,Grep \
  --effort high \
  --max-budget-usd 1.50 \
  "${prompt}"
