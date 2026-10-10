# Privacy

Web Spider Pet v0.1 runs locally in your Chromium browser.

## What it accesses

The extension reads the layout and links of the web page currently being displayed so the spider can locate real DOM links and crawl toward them. It also scrolls the current page when continuous exploration is enabled.

## What it does not do

Web Spider Pet v0.1:

- does not send page content to a server;
- does not use analytics or telemetry;
- does not contain an AI model or require an API key;
- does not automatically click links or navigate to another page;
- does not collect or upload browsing history;
- does not store page content for later use.

The extension currently declares only the `activeTab` permission. Its content script runs on normal HTTP and HTTPS pages so the spider can appear on those pages.

## Future AI features

AI / BYOK features are planned for later versions, but they are not part of v0.1. If they are added, their data flow and API-key handling should be documented here before release.

If you find behavior that does not match this document, please open an issue before using the extension with sensitive pages.
