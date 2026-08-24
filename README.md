# ELK Log Formatter

A browser-based tool for formatting and filtering raw JSON log hits exported from Kibana (ELK stack).

## Features

- **Paste & format** — accepts Kibana hits (`[{"_id":"...","fields":{...}}, ...]`) or ES|QL results (`[{"@timestamp":"...", ...}, ...]`) and renders them as readable log lines
- **Lucene query filter** — filter rendered logs using Kibana-style Lucene syntax with AND / OR / NOT, field-specific searches (`r:"abc" AND c:"Guide"`), and grouping
- **Date and time range** — an Elastic-inspired, standalone absolute range picker automatically initializes from exact `@timestamp` bounds, including milliseconds; changes apply with the main **Apply** button
- **Saved filters** — save frequently used filters, export/import them as JSON; persisted in `localStorage`
- **Sort toggle** — switch between ascending and descending timestamp order; persisted in `localStorage`
- **Highlight** — matched search terms are highlighted in the output
- **Copy to clipboard** — copy the formatted (filtered) output as plain text
- **Dark/light theme** — persisted in `localStorage`

## Usage

Open `index.html` directly in a browser — no build step or server required.

1. Paste JSON log data into the **Raw JSON Input** textarea
2. Click **Format** (or the output updates automatically)
3. Optionally type a Lucene query and/or choose an `@timestamp` date and time range to narrow results

## Filter Syntax

| Example | Description |
|---|---|
| `r:"my-request"` | Match field `r` |
| `c:"MyClass"` | Match field `c` (class/service) |
| `"startup"` | Free-text search across all fields |
| `r:"abc" AND c:"Guide"` | Both conditions must match |
| `"startup" OR "tune"` | Either term matches |
| `NOT "debug"` | Exclude term |
| `r:"abc" AND ("startup" OR "tune")` | Grouping |

## Project Structure

| File | Purpose |
|---|---|
| `index.html` | App shell and UI markup |
| `scripts/formatter.js` | Parses and formats raw Kibana/ES|QL JSON into log lines |
| `scripts/search.js` | Lucene query evaluator for filtering hits |
| `scripts/date-picker.js` | Active vanilla JS absolute date-range picker |
| `scripts/ui.js` | Composition root: formatting, filtering, theme, sort, output state |
| `scripts/constants.js` | Shared immutable UI values |
| `scripts/storage.js` | Saved-filter and date-range `localStorage` access |
| `scripts/utils.js` | Shared browser helpers |
| `scripts/input-controller.js` | Input metadata, formatting triggers, and JSON file drop handling |
| `scripts/search-ui-controller.js` | Search input, expanded editor, Apply, and Clear interactions |
| `scripts/output-controller.js` | Output selection, copy actions, and raw JSON interactions |
| `scripts/preferences-controller.js` | Theme, sort, and input-panel collapse preferences |
| `scripts/popup-*.js` | Popup lifecycle plus saved filters, date history, and filter help controllers |
| `styles/main.css` | CSS entry point; imports modules in cascade order |
| `styles/tokens.css` and `styles/base.css` | Design tokens, theme variables, reset, and global element styles |
| `styles/layout.css`, `controls.css`, `search.css`, and `input.css` | App shell and input/filter controls |
| `styles/output.css`, `popups.css`, `toast.css`, and `scrollbars.css` | Output, overlays, notifications, and scrollbar components |
| `styles/date-picker.css` | Styles for the active date-range picker |
| `scripts/lib/lucene-query-parser.min.js` | Bundled Lucene query parser |
