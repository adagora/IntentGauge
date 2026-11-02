# Fresh eyes

One pass, by the same author, after the tests were green. A second model was not available: the multi-model skill is not installed, and Agent Mail did not connect.

Fixed before the audit commit:

- `--version` together with `--help` now prints help instead of hiding it.
- The first `dashboard --once` test treated a check id named `answer` as leaked answer text. The snapshot still omits trial `output`. The test now checks for that field.

Left as they are:

- `dashboard` without `--once` listens until the process is stopped.
- `run` report ids and `createdAt` use the clock. Robot commands do not.
- Exit 1 is still a failed gate. The dictionary in `capabilities` says so.
