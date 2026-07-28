#!/usr/bin/env bash
#
# Applies the schema to a throwaway PostgreSQL database and runs the SQL test
# suite: family isolation under RLS, and the money maths.
#
# Two modes.
#
# 1. Self-contained (no arguments). Boots a private cluster with initdb, runs
#    the suite, tears it down. Needs PostgreSQL server binaries installed, but
#    no Docker and no running server:
#
#      ./scripts/db-test.sh
#
# 2. Against a server that already exists — a CI service container, or
#    `supabase start`. Set the usual libpq variables; only psql is needed
#    locally:
#
#      PGHOST=localhost PGPORT=5432 PGUSER=postgres PGPASSWORD=postgres \
#        ./scripts/db-test.sh
#
# Whichever mode, this runs against plain PostgreSQL via
# supabase/tests/00_supabase_shim.sql, which stubs the pieces of Supabase the
# schema leans on (auth.uid(), the auth and storage schemas, and the
# anon/authenticated/service_role grants). Point it at a real `supabase start`
# and skip the shim with NO_SHIM=1.
#
# The connecting role must be a superuser: the suite creates extensions and
# roles.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DB_NAME="${DB_NAME:-conest_test}"

STARTED_CLUSTER=0

if [ -n "${PGHOST:-}" ]; then
  # ---- Mode 2: use the server the environment points at ---------------------
  if ! command -v psql >/dev/null 2>&1; then
    echo "error: PGHOST is set but psql is not on PATH" >&2
    exit 1
  fi
  run() { bash -c "$1"; }
  PSQL_BASE="psql"
  SQL_DIR="$ROOT/supabase"
  echo "==> using PostgreSQL at ${PGHOST}:${PGPORT:-5432}"
else
  # ---- Mode 1: boot a private cluster --------------------------------------
  find_pg_bin() {
    if command -v initdb >/dev/null 2>&1; then
      dirname "$(command -v initdb)"
      return
    fi
    local candidate
    candidate="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1 || true)"
    [ -n "$candidate" ] && echo "$candidate"
  }

  PG_BIN="$(find_pg_bin || true)"
  if [ -z "${PG_BIN:-}" ]; then
    echo "error: no PostgreSQL server found (looked for initdb)." >&2
    echo "       Install PostgreSQL, or set PGHOST to point at a running server." >&2
    exit 1
  fi

  # initdb refuses to run as root, so when we are root the cluster is owned by
  # the postgres system user instead.
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

  echo "==> starting a private cluster on port $PORT"
  run "$PG_BIN/initdb -D $CLUSTER_DIR/pgdata -U postgres --auth=trust" >/dev/null
  run "$PG_BIN/pg_ctl -D $CLUSTER_DIR/pgdata -o '-k $CLUSTER_DIR/run -p $PORT -c listen_addresses=' -l $CLUSTER_DIR/pg.log start" >/dev/null
  STARTED_CLUSTER=1

  PSQL_BASE="$PG_BIN/psql -h $CLUSTER_DIR/run -p $PORT -U postgres"
  cleanup() {
    if [ "$STARTED_CLUSTER" = "1" ]; then
      run "$PG_BIN/pg_ctl -D $CLUSTER_DIR/pgdata -m immediate stop" >/dev/null 2>&1 || true
    fi
  }
  trap cleanup EXIT

  # The cluster runs as another user, so stage the SQL somewhere it can read.
  SQL_DIR="$CLUSTER_DIR/sql"
  rm -rf "$SQL_DIR"
  cp -r "$ROOT/supabase" "$SQL_DIR"
  [ -n "$RUN_AS" ] && chown -R "$RUN_AS":"$RUN_AS" "$SQL_DIR"
fi

PSQL="$PSQL_BASE -v ON_ERROR_STOP=1 -q"

echo "==> resetting $DB_NAME"
run "$PSQL_BASE -q -d postgres -c 'drop database if exists $DB_NAME;' -c 'create database $DB_NAME;'" >/dev/null
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
