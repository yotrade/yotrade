#!/usr/bin/env bash
# Starts a fresh Envio Cloud development deployment of the indexer and points production at it.
#
# Development deployments are deleted 30 days after they are created, and each has its own URL. Run this within
# 30 days of the last run, and once shortly before an event that must not lose the indexer (for the hackathon:
# 12 or 13 Oct 2026, which carries it past the end of judging on 3 Nov).
#
#   COOLIFY_URL=http://host:8000 COOLIFY_TOKEN=… COOLIFY_APP=… ./scripts/refresh-indexer.sh
#
# Needs git (push to origin), gh signed in as an account that may set repository variables (GH_TOKEN works),
# jq, curl, npx, and `npx envio-cloud login` done once.
# It deletes the oldest deployment that production does not use when the three-deployment limit is reached,
# after asking. Nothing else is destroyed; the running deployment serves until the new one has taken over.
set -euo pipefail

INDEXER=yotrade
ORG=yotrade
: "${COOLIFY_URL:?set COOLIFY_URL}" "${COOLIFY_TOKEN:?set COOLIFY_TOKEN}" "${COOLIFY_APP:?set COOLIFY_APP}"
cloud() { npx -y envio-cloud "$@"; }
coolify() { curl -sS --fail -m 60 -H "Authorization: Bearer $COOLIFY_TOKEN" -H 'content-type: application/json' "$@"; }
repo_root=$(git rev-parse --show-toplevel)

current=$(coolify "$COOLIFY_URL/api/v1/applications/$COOLIFY_APP/envs" |
  jq -r '[.[] | select(.key == "NEXT_PUBLIC_INDEXER_URL")][0].value // ""')
echo "production reads: ${current:-<default>}"

# Room for one more: the limit is three deployments per indexer.
deployments=$(cloud indexer get "$INDEXER" "$ORG" -o json)
count=$(jq '.data.deployments | length' <<<"$deployments")
if [ "$count" -ge 3 ]; then
  oldest=$(jq -r --arg current "$current" \
    '[.data.deployments[] | select(.gql_endpoint != $current)] | sort_by(.created_time) | .[0].commit_hash' \
    <<<"$deployments")
  read -r -p "Delete unused deployment $oldest to make room? [y/N] " answer
  [ "$answer" = "y" ] || { echo "Stopped: no room for a new deployment."; exit 1; }
  cloud deployment delete "$INDEXER" "$oldest" "$ORG" --yes
fi

# Every push to the deployment branch is a new deployment; an empty commit on top of main makes one.
git -C "$repo_root" fetch -q origin main
work=$(mktemp -d)
git -C "$repo_root" worktree add -q --detach "$work" origin/main
git -C "$work" commit -q --allow-empty -m "chore(indexer): fresh development deployment"
commit=$(git -C "$work" rev-parse --short=7 HEAD)
git -C "$work" push -q --force origin HEAD:refs/heads/envio
git -C "$repo_root" worktree remove --force "$work"
echo "pushed $commit to envio; waiting for Envio Cloud to index from the start block"

until cloud deployment status "$INDEXER" "$commit" "$ORG" 2>/dev/null | grep -q "Overall completion: 100.00%"; do
  sleep 30
done
endpoint=$(cloud deployment endpoint "$INDEXER" "$commit" "$ORG")
curl -sS --fail -m 30 "$endpoint" -H 'content-type: application/json' -d '{"query":"{ Stats { tournaments } }"}' |
  jq -e '.data.Stats[0].tournaments > 0' >/dev/null
echo "new endpoint answers: $endpoint"

# Build time: the browser bundle inlines it, so production is rebuilt.
coolify -X PATCH "$COOLIFY_URL/api/v1/applications/$COOLIFY_APP/envs/bulk" \
  -d "$(jq -n --arg url "$endpoint" '{data: [{key: "NEXT_PUBLIC_INDEXER_URL", value: $url, is_preview: false, is_literal: true, is_buildtime: true}]}')" >/dev/null
coolify -X POST "$COOLIFY_URL/api/v1/deploy?uuid=$COOLIFY_APP&force=false" >/dev/null
# The liquidator fallback workflow reads it from a repository variable.
gh variable set INDEXER_URL --body "$endpoint"
echo "production redeploying on $endpoint; check https://app.yotrade.xyz/api/health for indexer.ok in a few minutes"
