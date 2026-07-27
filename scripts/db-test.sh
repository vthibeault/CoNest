#!/usr/bin/env bash
#
# Applies the schema to a throwaway PostgreSQL database and runs the SQL test
# suite: family isolation under RLS, and the money maths.
#
# Requires a running PostgreSQL 14+ with pgcrypto and btree_gist available.
# It boots a private cluster if it cannot find one, so on a machine with
# postgres installed this is a single command with no setup:
#
#   ./scripts/db-test.sh
#
# Against an existing server instead:
#
#   PGURL=postgres://postgres@localhost:5432 ./scripts/db-test.sh
#
# Note this runs against plain PostgreSQL using supabase/tests/00_supabase_shim.sql,
# which stubs the pieces of Supabase the schema leans on (auth.uid(), the auth
# and storage schemas, and the anon/authenticated/service_role grants). That is
# what lets the suite run in CI without Docker. To exercise the real thing,
# `supabase start` and point PGURL at it, skipping the shim with NO_SHIM=1.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DB_NAME="${DB_NAME:-conest_test}"

find_pg_bin() {
  if command -v initdb >/dev/null 2>&1; then dirname "$(command -v initdb)"; return; fi
  local candidate
  candidate="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1 || true)"
  [ -n "$candidate" ] && echo "$candidate"
}

PG_BIN="$(find_pg_bin || true)"
if [ -z "${PG_BIN:-}" ]; then
  echo "error: no PostgreSQL installation found (looked for initdb)" >&2
  exit 1
fi

STARTED_CLUSTER=0
if [ -z "${PGURL:-}" ]; then
  # Boot a private cluster. initdb refuses to run as root, so when we are root
  # the cluster is owned by the postgres system user.
  CLUSTER_DIR="${CLUSTER_DIR:-${TMPDIR:-/tmp}/conest-pg}"
  PORT="${PGPORT:-55432}"
  RUN_AS=""
  if [ "$(id -u)" = "0" ]; then
    if ! id -u postgres >/dev/null 2>&1; then
      echo "error: running as root and no 'postgres' user exists to own the cluster" >&2
      exit 1
    fi
    CLUSTER_DIR="/var/lib/postgresql/conest-test"
    RUN_AS="postgres"
  fi

  run() { if [ -n "$RUN_AS" ]; then su "$RUN_AS" -c "$1"; else bash -c "$1"; fi; }

  rm -rf "$CLUSTER_DIR"
  mkdir -p "$CLUSTER_DIR/pgdata" "$CLUSTER_DIR/run"
  [ -n "$RUN_AS" ] && chown -R "$RUN_AS":"$RUN_AS" "$CLUSTER_DIR"
  chmod 700 "$CLUSTER_DIR/pgdata"

  run "$PG_BIN/initdb -D $CLUSTER_DIR/pgdata -U postgres --auth=trust" >/dev/null
  run "$PG_BIN/pg_ctl -D $CLUSTER_DIR/pgdata -o '-k $CLUSTER_DIR/run -p $PORT -c listen_addresses=' -l $CLUSTER_DIR/pg.log start" >/dev/null
  STARTED_CLUSTER=1

  PSQL_BASE="$PG_BIN/psql -h $CLUSTER_DIR/run -p $PORT -U postgres"
  cleanup() {
    [ "$STARTED_CLUSTER" = "1" ] && run "$PG_BIN/pg_ctl -D $CLUSTER_DIR/pgdata -m immediate stop" >/dev/null 2>&1 || true
  }
  trap cleanup EXIT

  # The cluster user needs to read the SQL, so stage it somewhere reachable.
  SQL_DIR="$CLUSTER_DIR/sql"
  rm -rf "$SQL_DIR"; cp -r "$ROOT/supabase" "$SQL_DIR"
  [ -n "$RUN_AS" ] && chown -R "$RUN_AS":"$RUN_AS" "$SQL_DIR"
else
  run() { bash -c "$1"; }
  PSQL_BASE="$PG_BIN/psql $PGURL"
  SQL_DIR="$ROOT/supabase"
fi

PSQL="$PSQL_BASE -v ON_ERROR_STOP=1 -q"

echo "==> resetting $DB_NAME"
run "$PSQL_BASE -q -c 'drop database if exists $DB_NAME;' -c 'create database $DB_NAME;'" >/dev/null
run "$PSQL -d $DB_NAME -c \"alter database $DB_NAME set search_path to public, extensions;\"" >/dev/null

if [ "${NO_SHIM:-0}" != "1" ]; then
  echo "==> applying Supabase shim"
  run "$PSQL -d $DB_NAME -f $SQL_DIR/tests/00_supabase_shim.sql" >/dev/null
fi

echo "==> applying migrations"
for f in "$SQL_DIR"/migrations/*.sql; do
  echo "    $(basename "$f")"
  run "$PSQL -d $DB_NAME -f $f" >/dev/null
done

echo "==> running tests"
for f in "$SQL_DIR"/tests/0[1-9]_*.sql; do
  run "$PSQL -d $DB_NAME -f $f"
done

echo
echo "All database tests passed."
