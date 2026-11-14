#!/bin/bash
set -eu
dnf -y install libstdc++ curl
rpm -ivh /packages/*el9*.rpm
chaos-lab --host 0.0.0.0 --port 4173 --no-open >/tmp/chaos-lab.log 2>&1 &
app_pid=$!
trap 'kill "$app_pid" 2>/dev/null || true' EXIT
for attempt in $(seq 1 60); do
  if curl -fsS http://127.0.0.1:4173/healthz >/tmp/health.json; then break; fi
  sleep 1
done
python_binary=""
if command -v python3 >/dev/null; then python_binary=python3; fi
if [ -n "$python_binary" ]; then
  "$python_binary" -c 'import json; d=json.load(open("/tmp/health.json")); assert d["status"]=="ok" and d["engine"]=="symbolic-distributions/v2"'
else
  test -s /tmp/health.json
fi
curl -fsS http://127.0.0.1:4173/app.js >/dev/null
cat /tmp/health.json
