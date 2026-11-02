# Ambition bar

Tiny CLI bar: at least five substantive surface changes, at least three dimensions, and one each of mega-command, capabilities or robot-docs, `--json`, an error rewrite, and typo recovery.

Shipped and pinned:

1. `capabilities --json` (R-001)
2. `robot-docs guide` (R-002)
3. `--robot-triage` (R-003)
4. Usage errors that name the next command (R-004)
5. Typo hints for commands and flags (R-005)
6. `--json` and machine help (R-006)
7. `version` and plain help (R-007)
8. `dashboard --once` and `help --json` (R-009)

Dimensions moved: self-documentation, ergonomics, error pedagogy, intent inference, output parseability, and ease of use.

## Self-prompt

The first code commit held R-001 through R-007. That is one commit, so the commit-count trigger fired. The prompt was run as written:

```
That's it?? I was hoping you would get a lot more practical value out of this skill.
Where are the dramatic improvements? Re-read the playbook, look at the surfaces still
scoring below 500 on output_parseability / error_pedagogy / intent_inference /
self_documentation, and ship a substantially larger batch of high-leverage changes.
You're allowed to be ambitious. Default to acting, not deliberating.
```

The surface still failing an agent on the first try was `dashboard`: it blocked on a port. `help` was also plain text only. The second commit adds `dashboard --once` and `help --json`. Those are R-009.

A second loop was not started. `run` timestamps and a live `--dry-run` mode are recorded as deferred in R-008 and in HANDOFF.md. Exit codes were not remapped.
