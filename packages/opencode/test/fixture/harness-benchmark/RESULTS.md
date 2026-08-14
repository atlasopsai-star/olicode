# OliBench core results

Recorded 2026-08-14 with `openai/gpt-5.4-mini`. Each lane used the same prompt, fixture, repository state, provider configuration, permissions, and 120-second task timeout. Values are medians of three successful trials; tokens exclude cache reads/writes.

The stock control is the official OpenCode `v1.15.11` macOS ARM64 release at commit `d2bd7eaad54bf39de04bf6e279d5953bd1666574`. Release zip SHA-256: `f82f0bdb285836971c63677dd18d7005dbaf46bfd04e22383905bf8453f4db8c`.

| Task | Lane | Success | Time | Tokens | Turns | Tools | Files | LOC |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Button label (FAST) | OpenCode | 3/3 | 25.073s | 44,565 | 4 | 5 | 1 | 2 |
| Button label (FAST) | OliCode | 3/3 | 15.050s | 5,631 | 4 | 3 | 1 | 2 |
| Loading state (STANDARD) | OpenCode | 3/3 | 32.911s | 46,320 | 5 | 8 | 2 | 8 |
| Loading state (STANDARD) | OliCode | 3/3 | 24.044s | 7,857 | 5 | 7 | 2 | 8 |
| Boundary bug (DEBUG) | OpenCode | 3/3 | 30.491s | 46,143 | 6 | 10 | 2 | 3 |
| Boundary bug (DEBUG) | OliCode | 3/3 | 29.121s | 3,741 | 6 | 7 | 2 | 3 |

All recorded OliCode trials had zero scope violations, proof corrections, unsupported completion claims, failed commands, and specialist skills loaded.

Run with:

```bash
OLI_BENCH_MODEL=openai/gpt-5.4-mini \
OLI_BENCH_STOCK_BINARY=/path/to/opencode-v1.15.11 \
OLI_BENCH_RUNS=3 \
bun run bench:harness
```

These results support the three listed core fixtures only. They do not establish superiority for design, browser automation, or shipping; those categories require their own repeated official-control trials.
