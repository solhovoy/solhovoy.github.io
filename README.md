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
- **Settings** — centered Settings dialog with live formatted-output preview, explicit Save/Cancel controls, and JSON export/import
- **Dark/light theme** — switch themes from **Settings → General**; persisted in `localStorage`
- **Output visibility** — show or hide raw JSON data and the `t`, `a`, `r`, `p`, and `h` fields; persisted as JSON in `localStorage`
- **Selected rows** — optionally highlight checked logs with a theme-aware border; selections survive Output visibility changes
- **Field picker** — click the fields-panel icon before the filter input to search available keys and add/remove selected fields in a left sidebar (hidden by default; open/closed state persisted in `localStorage`; on desktop the panel can be resized by dragging its right edge, min 180px / max 60% of the layout, with the width persisted in `localStorage`; a badge on the icon shows the selected count). With any fields selected, the output shows the date and one column per selected field, with field names in the sticky header; long values are truncated with an ellipsis (hover for the full value). Drag a column header's right edge to resize it; double-click the edge to reset it to the automatic width. Columns are automatically sized to their widest value or header, capped at 200px (recomputed on every render unless resized manually). The last column fills the remaining width by default but can also be dragged wider than the output, enabling horizontal scrolling; holding the pointer near the output's right (or left) edge while dragging auto-scrolls and keeps resizing. Widths are kept for the page session only and are not persisted. Clipboard copies still contain the date and `key=value` pairs; missing values appear as `null`. Nested objects use dotted keys. Date is always displayed and is not listed. The reset (revert) icon next to **Selected fields** restores the standard format. Hover a field and click its pin icon to add it to **Pinned fields** (above **Selected fields**) for quick access: pinned fields stay listed even when absent from the current logs or already selected; absent pinned fields are dimmed. Clicking a pinned field adds it to the selected fields, and clicking its highlighted pin unpins it. Pinned fields are persisted as JSON in `localStorage`, are kept by **Clear**, and may also appear in **Available fields**. Queries and date ranges still filter the original logs, independently of field selection.

Settings can be exported from the Settings dialog as a JSON snapshot containing the theme, output visibility settings, and the fields panel open/closed state and width (280px when the panel has not been resized). Drop that JSON file onto the dialog to import it; valid imports fill the controls and are saved automatically (older snapshots without the fields panel state or width leave them unchanged). Sort order is not included.

## Usage

Open `index.html` directly in a browser — no build step or server required.

1. Paste JSON log data into the **Raw JSON Input** textarea
2. Click **Format** (or the output updates automatically)
3. Optionally type a Lucene query and/or choose an `@timestamp` date and time range to narrow results
4. Click the fields-panel icon (left of the filter input) to choose which keys to display. Click the **Pinned fields**, **Selected fields**, or **Available fields** heading to collapse or expand its list without changing selection or pins. Available fields reflect the logs matching the current query and date range; selected fields stay selected even if absent from the filtered logs. The field-name search has a clear button on the right; clearing it restores the full field list without changing selected fields. Removing all selected fields restores the standard output. Selection is kept while filtering/sorting, and **Clear** resets it.

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
| `scripts/ui.js` | Composition root: formatting, filtering, preferences, and output state |
| `scripts/constants.js` | Shared immutable UI values |
| `scripts/storage.js` | Saved-filter, date-range, and Output-settings `localStorage` access |
| `scripts/utils.js` | Shared browser helpers |
| `scripts/input-controller.js` | Input metadata, formatting triggers, and JSON file drop handling |
| `scripts/search-ui-controller.js` | Search input, expanded editor, Apply, and Clear interactions |
| `scripts/output-controller.js` | Output selection, copy actions, and raw JSON interactions |
| `scripts/fields-controller.js` | Available/selected log fields, field-name search, and sidebar controls |
| `scripts/preferences-controller.js` | Theme, sort, input-panel collapse, and persisted Output preferences |
| `scripts/settings-controller.js` | Settings dialog categories, preview state, Save/Cancel behavior, and theme switching |
| `scripts/popup-*.js` | Popup lifecycle plus saved filters, date history, and filter help controllers |
| `styles/main.css` | CSS entry point; imports modules in cascade order |
| `styles/tokens.css` and `styles/base.css` | Design tokens, theme variables, reset, and global element styles |
| `styles/layout.css`, `controls.css`, `search.css`, and `input.css` | App shell and input/filter controls |
| `styles/output.css`, `popups.css`, `settings.css`, `toast.css`, and `scrollbars.css` | Output, popup/modal, Settings, notifications, and scrollbar components |
| `styles/date-picker.css` | Styles for the active date-range picker |
| `scripts/lib/lucene-query-parser.min.js` | Bundled Lucene query parser |
