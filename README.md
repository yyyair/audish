# Audish

A VS Code extension for code researchers and security auditors. Organizes your work into **campaigns** — named sessions that track bookmarks, coverage, and inline comments across a codebase.

100% Vibecoded by Claude so might have some goofy behavior / bugs.

## Features

### Campaigns
Named research sessions. All data (bookmarks, coverage, comments) is scoped to the active campaign. Switch between campaigns without losing work. Export/import campaigns as JSON for sharing.

### Bookmarks
Mark any line for quick navigation. Bookmarked lines get a yellow left border and an overview ruler indicator.

| Action | Keybinding |
|--------|-----------|
| Add bookmark | `Ctrl+Alt+B` / `Cmd+Alt+B` |

### Coverage
Mark lines as "seen" with a green background — like a diff view for code you've reviewed. Works on multi-line selections.

| Action | Keybinding |
|--------|-----------|
| Mark as seen | `Ctrl+Alt+S` / `Cmd+Alt+S` |
| Unmark | Right-click → Unmark Line(s) as Seen |

### Comments
Attach inline annotations to any line. Comments appear as a CodeLens row above the line with the comment text, clickable links, and Edit/Delete actions — no file modifications.

**Link syntax inside comments:**

| Syntax | Description |
|--------|-------------|
| `@filename` | Link to a file |
| `@src/path/file.ts:42` | Link to a file at a specific line |
| `@#symbolName` | Link to a workspace symbol |

The comment editor has `@`-autocomplete: start typing `@` to get file suggestions, `@#` for symbols.

| Action | Keybinding |
|--------|-----------|
| Add / edit comment | `Ctrl+Alt+C` / `Cmd+Alt+C` |

### Coverage Statistics
`Audish: Show Coverage Statistics` — opens a file picker showing covered lines and percentage per file for the active campaign.

### View Toggles

| Command | Description |
|---------|-------------|
| `Audish: Toggle All Markup` | Hide/show all decorations and CodeLens rows |
| `Audish: Toggle Comment Display: CodeLens ↔ Inline` | Switch between clickable CodeLens rows and inline after-text |

## Data Storage

All campaign data is stored in `.audish/` within your workspace folder. Add it to `.gitignore` or commit it to share with teammates.

```
.audish/
  campaigns.json
  <campaign-id>/
    bookmarks.json
    coverage.json
    comments.json
```

## Requirements

VS Code 1.85 or later. No external dependencies.
