# ELK Log Formatter

A browser-based tool for formatting and filtering raw JSON log hits exported from Kibana (ELK stack).

## Features

- **Paste & format** — accepts Kibana hits (`[{"_id":"...","fields":{...}}, ...]`) or ES|QL results (`[{"@timestamp":"...", ...}, ...]`) and renders them as readable log lines
- **Lucene query filter** — filter rendered logs using Kibana-style Lucene syntax with AND / OR / NOT, field-specific searches (`r:"abc" AND c:"Guide"`), and grouping
- **Saved filters** — save frequently used filters, export/import them as JSON; persisted in `localStorage`
- **Sort toggle** — switch between ascending and descending timestamp order; persisted in `localStorage`
- **Highlight** — matched search terms are highlighted in the output
- **Copy to clipboard** — copy the formatted (filtered) output as plain text
- **Dark/light theme** — persisted in `localStorage`

## Usage

Open `index.html` directly in a browser — no build step or server required.

1. Paste JSON log data into the **Raw JSON Input** textarea
2. Click **Format** (or the output updates automatically)
3. Optionally type a Lucene query in the **Filter** bar to narrow results

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
| `formatter.js` | Parses and formats raw Kibana/ES|QL JSON into log lines |
| `search.js` | Lucene query evaluator for filtering hits |
| `ui.js` | DOM wiring, theme, sort, saved filters, copy |
| `style.css` | Styles (dark/light theme) |
| `lib/lucene-query-parser.min.js` | Bundled Lucene query parser |
