# Flowcharts

This folder contains Mermaid flowcharts for presentation and documentation.

## Files

- app-overview-presentation.mmd: Simplified one-page app overview.
- booking-deep-dive.mmd: Booking-only lifecycle and validation flow.
- auth-deep-dive.mmd: Auth-only flows (register, login, reset, Google, JWT).
- admin-deep-dive.mmd: Admin-only analytics, moderation, and export flow.
- app-overview-export-ready.mmd: Tight-layout variant optimized for PNG/SVG export.
- repository-graph.mmd: High-level repository structure and backend/frontend interaction map.

## Export To PNG/SVG

Use Mermaid CLI (mmdc):

```bash
npx @mermaid-js/mermaid-cli -i docs/flowcharts/app-overview-export-ready.mmd -o docs/flowcharts/app-overview-export-ready.svg
npx @mermaid-js/mermaid-cli -i docs/flowcharts/app-overview-export-ready.mmd -o docs/flowcharts/app-overview-export-ready.png -w 2200 -H 1200 -b white
```

You can replace the input file to export any deep-dive chart.
