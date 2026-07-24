# ASP.NET Core 10 example

An ASP.NET Core MVC (net10.0) application that embeds free-block-engine and
persists the board on the server.

## What it demonstrates

- Serving the library bundle from `wwwroot/lib` (copied from `dist/` by an
  MSBuild target on every build — no manual copying).
- A block canvas page (`Views/Home/Index.cshtml` + `wwwroot/js/board.js`)
  with undo/redo, zoom controls, image export and server save/load.
- A REST endpoint (`Controllers/BoardApiController.cs`):
  - `GET /api/board` — returns the saved board JSON (204 when empty);
  - `POST /api/board` — validates the engine export format (object with a
    `blocks` array), enforces a size limit and requires the anti-forgery
    token (`X-CSRF-TOKEN` header, issued via a meta tag in the layout).
- `Services/FileBoardStorage.cs` — semaphore-guarded atomic file persistence
  in `App_Data/board.json` (swap `IBoardStorage` for a database in real apps).
- Debounced **autosave to the server** through `createAutosave()` with a
  custom Web Storage-shaped adapter, flushed on `pagehide` so the last edits
  survive closing the tab.
- Integration tests in `examples/aspnetcore.Tests` (xUnit +
  `WebApplicationFactory`): the empty state, anti-forgery rejection, the
  save/load round-trip, payload validation and the file storage itself.

## Renderer options in use

`board.js` turns on the optional renderer features rather than reimplementing
them, which is the point worth copying:

```javascript
const renderer = new BlockRenderer(engine, 'board', {
  keyboardShortcuts: true, // Ctrl+Z/Y, Ctrl+A, Ctrl+D, Delete, arrow nudge
  snapGuides: true, // alignment guides while dragging
  contextMenu: true, // right-click / long-press
  theme: 'auto', // follows prefers-color-scheme
  contextMenuItems: (target, defaults) => /* adds "Save to server" */,
});
```

Only `Ctrl+S` (save to the server) is handled by the page — everything else
comes from the library.

### Theming

The library themes its **own canvas** through `--fbe-*` variables and the
`light`/`dark` presets; the surrounding page chrome is the host's
responsibility. This example shows the usual arrangement: `board.js` mirrors
`renderer.getTheme()` onto `<body class="dark">` and `site.css` restyles the
toolbar to match, while `#board.blocks-container` overrides a couple of accent
variables on top of whichever preset is active. The chosen theme is kept in
`localStorage`.

### Autosave to the server

`createAutosave()` accepts any object with `getItem`/`setItem`/`removeItem`,
so the helper that normally targets localStorage persists to the backend
instead:

```javascript
const autosave = createAutosave(engine, {
  debounceMs: 1500,
  storage: {
    getItem: () => null, // the initial load stays on the async fetch path
    setItem: (_key, json) => {
      // setItem is synchronous by contract — fire the request, don't await it
      fetch('/api/board', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-TOKEN': csrfToken },
        body: json,
      });
    },
    removeItem: () => {},
  },
});
```

Two details worth copying: the autosaver is created only **after** the
initial load completes (importing a board records history, which would
otherwise re-save what was just loaded), and a `pagehide` listener calls
`autosave.flush()` with `fetch(..., { keepalive: true })` so the final save
outlives the tab (keepalive caps the body at ~64 KB, hence it is enabled for
that save only). The **Save to server** button and Ctrl+S stay for explicit,
immediate saves.

## Run

```bash
# from the repository root: build the library bundle once
npm install
npm run build

# then run the example
cd examples/aspnetcore
dotnet run
```

Open the URL printed by `dotnet run` (e.g. http://localhost:5000). The page
loads the saved board from the server or creates a sample one. Edits autosave
after a short pause; **Save to server** (or Ctrl+S) persists immediately.

## Test

```bash
# needs dist/ as well: the web project refuses to build without the bundle
dotnet test examples/aspnetcore.Tests
```
