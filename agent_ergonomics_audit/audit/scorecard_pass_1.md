# Scorecard, pass 1

One scorer. Scores above 700 cite a source line or a regression test in `agent_surfaces.jsonl`. There was no second model, so `spread_max` is 0.

Weighted score is the integer mean of the eleven dimensions. The pre column is the CLI before `7d64a2f`. The post column includes `179c321`.

| Surface | Before | After | Delta |
|---|---:|---:|---:|
| exit code 0 | 580 | 761 | 181 |
| --replay | 572 | 796 | 224 |
| exit code 1 | 509 | 745 | 236 |
| calibrate | 532 | 776 | 244 |
| compare | 545 | 790 | 245 |
| validate | 540 | 810 | 270 |
| --repetitions | 467 | 752 | 285 |
| exit code 2 | 529 | 814 | 285 |
| run | 489 | 780 | 291 |
| help | 472 | 785 | 313 |
| flag on the wrong command | 423 | 767 | 344 |
| dashboard | 368 | 727 | 359 |
| unknown command | 374 | 792 | 418 |
| unknown flag | 346 | 785 | 439 |
| --json | 217 | 814 | 597 |
| version | 0 | 778 | 778 |
| robot-docs | 0 | 780 | 780 |
| --robot-triage | 0 | 792 | 792 |
| capabilities | 0 | 796 | 796 |

Median delta across these 19 surfaces: 313. Median across the 15 surfaces that already existed: 285.

`run` determinism stays at 420 because a saved report records the clock. `dashboard` determinism stays at 300 for the same reason. The listening server is still the default. `--once` is the batch read.
