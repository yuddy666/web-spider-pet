# Web Spider Pet — Technical Notes

This document keeps the implementation details out of the public-facing README while preserving the behavior and constraints of the v0.1 prototype.

## Scope

Web Spider Pet v0.1 is a Chromium Manifest V3 extension. It does not contain AI, a backend, automatic link clicking, cross-page navigation, or a native desktop application.

The core rule is simple: visible animation should correspond to real program state. The project does not fake network requests, loading states, `404`, `403`, `429`, or crawler progress.

## Page perception

- The content script scans the main document for `a[href]` elements.
- Link geometry is measured with `getBoundingClientRect()`.
- Only HTTP / HTTPS targets are considered.
- Hidden, occluded, off-screen, or otherwise unsuitable targets are filtered conservatively.
- DOM geometry is remeasured while moving and after page/layout changes.
- The overlay uses Shadow DOM and `pointer-events: none`, so it does not intercept normal page interaction.

## Exploration state machine

The current states are:

| State | Meaning |
| --- | --- |
| `IDLE` | Frozen and waiting for the user |
| `SCANNING` | Measuring real DOM links |
| `MOVING` | Crawling toward the selected link |
| `ARRIVED` | Reached the link area; no navigation has happened |
| `SCROLLING` | Crawling while slowly scrolling downward to discover more links |

Continuous exploration chooses nearby visible targets that have not yet been reached in the current run. A DOM element is visited at most once per run, with a current upper limit of 50 targets.

Single-target mode visits one target and stops. It never auto-scrolls.

## Spider locomotion

The spider is rendered as a transparent SVG overlay. Its body and eight legs are procedural rather than a prerecorded sprite animation.

### Two-bone IK

Each leg uses a fixed-length two-segment IK chain:

- front/rear pairs: upper segment 35 px, lower segment 43 px;
- middle pairs: upper segment 40 px, lower segment 46 px.

The knee is solved geometrically from the hip and planted foot position. Each leg keeps a stable outward-bending branch so knees do not suddenly flip sides.

A planted foot remains attached to the page surface until its comfortable reach is exceeded or the natural step target becomes too far away. Only a swinging foot is allowed to move toward a new landing point.

### Gait

The eight legs are split into alternating support groups:

- group A: left 2/4 + right 1/3;
- group B: left 1/3 + right 2/4.

One group must finish planting before the other can lift, so the spider keeps at least four supporting feet.

The gait is driven by actual body translation and turning, not by a decorative timer. When the body stops, the full pose freezes.

### Body motion

The body uses acceleration, steering, turn-rate limits, arrival slowdown, and small gait-coupled vertical/lateral offsets. These offsets only advance while the spider is really moving.

Current representative values include:

- normal crawl speed: about 108 viewport px/s maximum;
- search crawl speed while scrolling: up to 150 px/s;
- maximum turn rate: 1.8 rad/s;
- turn acceleration: 6 rad/s².

## Scrolling and page-surface attachment

When continuous mode runs out of unexplored visible links and the root document still has content below, the extension enters `SCROLLING`.

- scrolling is performed with small `requestAnimationFrame` + `window.scrollBy()` steps;
- scroll speed is capped around 90 CSS px/s;
- the spider keeps crawling during the scroll instead of freezing;
- links are rescanned periodically and a newly visible target smoothly takes over from the search motion.

Spider body, hips, knees, planted feet, and pending step trajectories are stored as viewport projections of positions attached to the root document surface.

When the root document scrolls, the measured scroll delta is applied once to the complete pose. This keeps planted feet attached to the same document location during normal slow scrolling. Camera movement itself is not counted as gait distance; only movement relative to the page surface advances the gait.

Large manual jump-scrolls are intentionally treated as a visual-continuity special case: projection displacement is limited so the spider is not violently thrown off-screen. In that case the pose remains continuous, but the old exact page-pixel attachment is not guaranteed.

## Automatic downward exploration

Continuous exploration behaves roughly as follows:

1. scan visible links;
2. pick a nearby unexplored target;
3. crawl to it;
4. rescan;
5. if no target remains and more document exists below, crawl while scrolling downward;
6. as soon as a new real target becomes visible, smoothly return to target pursuit;
7. stop at the bottom, on the per-run target limit, when scrolling is blocked, or when the user stops exploration.

The extension only scrolls the root document. Inner scroll containers, complex scroll-snap behavior, iframes, and page Shadow DOM are outside the v0.1 scope.

## Privacy and permissions

The extension does not upload page content, browsing history, or telemetry. `activeTab` is used for popup-to-tab communication. See [`PRIVACY.md`](../PRIVACY.md) for the public privacy statement.

## Verification

Run:

```sh
npm test
npm run typecheck
npm run build
```

Manual checks should include:

1. single-target arrival and frozen final pose;
2. continuous traversal across several links;
3. downward exploration through a long page;
4. crawling that continues while the page scrolls;
5. retargeting when a target disappears or leaves the viewport;
6. immediate stop behavior during both `MOVING` and `SCROLLING`;
7. normal page clicking through the overlay;
8. pages with no links, hidden links, and long empty regions.

## Current limits

- protected Chrome pages and the Chrome Web Store cannot be injected;
- `file://` pages are not enabled;
- iframes and page Shadow DOM are not traversed;
- inner scroll containers are not auto-scrolled;
- complex clipping and multi-line link geometry may be skipped conservatively;
- late infinite-load content is not waited for;
- real network status visualization is not implemented yet.

## Longer-term direction

Browser spider → real Web crawler → desktop pet → natural-language / BYOK AI agent → visible network exploration.

The intended future model is that the AI chooses semantic actions and targets, while the existing locomotion layer remains responsible for the physical movement on screen.
