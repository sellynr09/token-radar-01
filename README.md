# token-radar-01

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/sellynr09/token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/sellynr09/token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Token Radar — a dashboard that ranks pre-token DeFi protocols by implied token value, computed from a sealed DefiLlama snapshot (TVL, seven-day growth, age with no token), with a concrete farm plan for every protocol. The board covers all 40 watchlist protocols plus every other rankable pre-token protocol in the snapshot, 198 rows in all, and sets the live-token protocols aside with their market caps. The dashboard is a static page with no network: search, category, chain and TVL filters, sortable columns, a detail view per protocol with the model's own breakdown, and eight summary tiles.

## Run it

```sh
# with the sealed snapshot mounted at /input (as the grader does):
node main.ts
# locally, with a snapshot file:
MAKEFUN_OUTPUT_DIR=out node main.ts --input snapshot.json
```

Node 22.18 or later, standard library only. The program writes `board.json`, `data.js`, `dashboard/`, `screenshots/` and `dossier.json` to the output directory; run it twice and the bytes are identical.

---

<sub>Entered on [make.fun](https://make.fun/?ref=97nq7crj&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
