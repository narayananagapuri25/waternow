#!/usr/bin/env python3
"""Compare a schema-only D1 export with WaterNow's canonical schema snapshot.

No production data is exported. Both SQL inputs are loaded into temporary in-memory
SQLite databases and only schema metadata is compared.
"""
from __future__ import annotations

import argparse
import json
import re
import sqlite3
import sys
from pathlib import Path


def connect_from_sql(path: Path) -> sqlite3.Connection:
    conn = sqlite3.connect(":memory:")
    conn.execute("PRAGMA foreign_keys=OFF")
    sql = path.read_text(encoding="utf-8")
    try:
        conn.executescript(sql)
    except sqlite3.Error as exc:
        raise RuntimeError(f"Could not load schema SQL {path.name}: {exc}") from exc
    return conn


def app_tables(conn: sqlite3.Connection) -> set[str]:
    rows = conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table' "
        "AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' "
        "AND name <> 'd1_migrations'"
    ).fetchall()
    return {row[0] for row in rows}


def columns(conn: sqlite3.Connection, table: str) -> list[tuple]:
    return [
        (row[1], (row[2] or "").upper(), int(row[3]), row[4], int(row[5]))
        for row in conn.execute(f'PRAGMA table_info("{table}")')
    ]


def foreign_keys(conn: sqlite3.Connection, table: str) -> list[tuple]:
    return sorted(
        (row[2], row[3], row[4], row[5], row[6])
        for row in conn.execute(f'PRAGMA foreign_key_list("{table}")')
    )


def indexes(conn: sqlite3.Connection, table: str) -> list[tuple]:
    out = []
    for row in conn.execute(f'PRAGMA index_list("{table}")'):
        name, unique, origin, partial = row[1], int(row[2]), row[3], int(row[4])
        cols = tuple(
            item[2] for item in conn.execute(f'PRAGMA index_info("{name}")')
        )
        out.append((unique, origin, partial, cols))
    return sorted(out, key=repr)


def normalize_sql(sql: str) -> str:
    # Collapse formatting outside single-quoted SQL literals without changing
    # literal values. Wrangler's exporter reformats commas and line breaks.
    parts = re.split(r"('(?:''|[^'])*')", sql.strip())
    return "".join(
        part if index % 2 else re.sub(r"\s+", "", part).lower()
        for index, part in enumerate(parts)
    )


def object_sql(conn: sqlite3.Connection, kind: str) -> dict[str, str]:
    rows = conn.execute(
        "SELECT name, sql FROM sqlite_master WHERE type=? AND sql IS NOT NULL "
        "AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' "
        "AND name <> 'd1_migrations' ORDER BY name",
        (kind,),
    ).fetchall()
    return {name: normalize_sql(sql) for name, sql in rows}


def compare(expected: sqlite3.Connection, actual: sqlite3.Connection) -> list[str]:
    issues: list[str] = []
    exp_tables, act_tables = app_tables(expected), app_tables(actual)
    for name in sorted(exp_tables - act_tables):
        issues.append(f"missing table: {name}")
    for name in sorted(act_tables - exp_tables):
        issues.append(f"unexpected application table: {name}")

    for table in sorted(exp_tables & act_tables):
        exp_cols, act_cols = columns(expected, table), columns(actual, table)
        if exp_cols != act_cols:
            issues.append(
                f"column mismatch: {table}\n"
                f"  expected={json.dumps(exp_cols, default=str)}\n"
                f"  actual={json.dumps(act_cols, default=str)}"
            )
        exp_fk, act_fk = foreign_keys(expected, table), foreign_keys(actual, table)
        if exp_fk != act_fk:
            issues.append(
                f"foreign-key mismatch: {table}\n"
                f"  expected={json.dumps(exp_fk)}\n"
                f"  actual={json.dumps(act_fk)}"
            )
        exp_ix, act_ix = indexes(expected, table), indexes(actual, table)
        if exp_ix != act_ix:
            issues.append(
                f"index mismatch: {table}\n"
                f"  expected={json.dumps(exp_ix, default=str)}\n"
                f"  actual={json.dumps(act_ix, default=str)}"
            )

    for kind in ("index", "trigger"):
        exp, act = object_sql(expected, kind), object_sql(actual, kind)
        for name in sorted(exp.keys() - act.keys()):
            issues.append(f"missing {kind}: {name}")
        for name in sorted(act.keys() - exp.keys()):
            issues.append(f"unexpected {kind}: {name}")
        for name in sorted(exp.keys() & act.keys()):
            if exp[name] != act[name]:
                issues.append(
                    f"{kind} definition mismatch: {name}\n"
                    f"  expected={exp[name]}\n  actual={act[name]}"
                )
    return issues


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--expected", required=True, type=Path)
    parser.add_argument("--actual", required=True, type=Path)
    args = parser.parse_args()

    expected = connect_from_sql(args.expected)
    actual = connect_from_sql(args.actual)
    expected_table_count = len(app_tables(expected))
    try:
        issues = compare(expected, actual)
    finally:
        expected.close()
        actual.close()

    if issues:
        print(f"Production schema comparison FAILED: {len(issues)} difference(s).")
        for issue in issues:
            print(f" - {issue}")
        return 1

    print(
        f"Production schema comparison PASSED: {expected_table_count} "
        "application tables, all columns, foreign keys, indexes and triggers match."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
