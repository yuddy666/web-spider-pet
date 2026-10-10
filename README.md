# Web Spider Pet 🕷️

**English** | [简体中文](README.zh-CN.md)

**A tiny spider that actually crawls the web.**  
*Not just a crawler — the crawler is the spider.*

![version](https://img.shields.io/badge/version-v0.1.0-blue)
![license](https://img.shields.io/badge/license-MIT-green)
![Chromium](https://img.shields.io/badge/Chromium-Manifest%20V3-orange)

Web Spider Pet turns the “web crawler” metaphor back into a literal spider. It reads the positions of real links on a page, moves across the page with procedural IK legs, and keeps crawling while the page slowly scrolls downward to discover more links.

v0.1 is still a **Chromium browser extension prototype**. It can explore the current page, but it **does not click links automatically, navigate across pages, use AI, or upload page content to a server**.

> It crawls the page, not the network — yet.

## Demo

[Watch the ~30-second real-time demo (MP4)](docs/demo/scroll-crawling.mp4)

[![Web Spider Pet scrolling demo](docs/demo/scroll-crawling.png)](docs/demo/scroll-crawling.mp4)

In the demo, the spider moves toward real DOM links and keeps using the same IK support and stepping logic while the page scrolls. The footage is not sped up, and the locomotion is not replaced by a pre-baked animation.

## What makes it different

- **Real page geometry** — targets come from actual `a[href]` elements and `getBoundingClientRect()`, not from decorative points.
- **Procedural eight-leg locomotion** — every leg uses two-bone IK, with stepping, reach, support, and foot placement driven by real body motion.
- **It keeps crawling while the page scrolls** — the spider does not freeze during downward exploration; its feet stay projected onto the page surface and continue supporting the body.
- **Animation reflects real state** — stopped means stopped, scanning means scanning. No fake “busy” animation is used to pretend the program is doing work.
- **It does not block the page** — the overlay is isolated with Shadow DOM and uses `pointer-events: none`.
- **Local-first** — v0.1 has no telemetry, backend, AI, or API-key requirement.

## Quick start

Requires Node.js 20.19+ or 22.12+ (current LTS recommended) and npm.

```sh
git clone https://github.com/yuddy666/web-spider-pet.git
cd web-spider-pet
npm install
npm run build
```

Then:

1. Open `chrome://extensions` in Chrome / Chromium.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select the project's `dist/` directory.
5. Open a normal HTTP / HTTPS page. Refresh pages that were already open.
6. Open the Web Spider Pet extension popup and click **Start exploring**.

**Single link** makes the spider complete one move and stop. **Start exploring** continuously visits real links on the current page and slowly explores downward when needed.

After changing the source, rebuild with:

```sh
npm run build
```

Then reload the extension from the extensions page and refresh the test page.

## Local demo page

```sh
npm run demo
```

Open the address printed by Vite and go to `/demo/`. Vite only serves the local test page; the browser extension is still loaded from `dist/`.

## Current behavior

v0.1 scans visible, reachable HTTP / HTTPS links in the current main document, chooses nearby targets that have not been reached yet, and crawls toward them. In continuous exploration, each DOM link is reached at most once per run, with a current limit of 50 targets.

When the current viewport has no unexplored targets but more content exists below, the spider enters `SCROLLING`: the page moves downward slowly while the spider keeps crawling toward a lower search area. When a new real link appears, it preserves its heading, speed, and gait state and smoothly returns to target tracking.

| State | Meaning |
| --- | --- |
| `IDLE` | Waiting in place; no simulated work |
| `SCANNING` | Scanning and measuring real DOM links |
| `MOVING` | Moving toward the selected link |
| `ARRIVED` | Reached the link area, but did not open it |
| `SCROLLING` | Crawling while slowly scrolling to find new real links |

## What v0.1 does **not** do

- It does not automatically click or open links.
- It does not autonomously navigate across pages.
- It is not a backend web crawler yet.
- It does not include an LLM / AI Agent.
- It does not require or store an API key.
- It does not read or upload browsing history.
- It does not fake unimplemented network states such as `404 / 403 / 429`.

Those boundaries are intentional: v0.1 focuses on making one idea work well — **the spider actually crawls across the page**.

## Technical notes

Detailed notes on IK, gait, scroll-coordinate projection, the state machine, and testing live in [`docs/TECHNICAL.md`](docs/TECHNICAL.md).

Common checks:

```sh
npm test
npm run typecheck
npm run build
```

## Privacy

v0.1 runs entirely in the local browser. It does not upload page content and has no analytics or telemetry. See [`PRIVACY.md`](PRIVACY.md) for details.

## Roadmap

The plan is to gradually grow the spider from a rule-driven page pet into a real Web Agent:

**browser spider → link navigation → BYOK LLM / Agent → voice input → cross-page exploration → desktop pet**

The core principle will stay the same: **the model decides where to go and what to do; the existing locomotion layer makes the spider physically crawl there.**

## Changelog

See [`CHANGELOG.md`](CHANGELOG.md).

## License

MIT License. See [`LICENSE`](LICENSE).