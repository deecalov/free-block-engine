# ASP.NET Core 10 example

An ASP.NET Core MVC (net10.0) application that embeds free-block-engine and
persists the board on the server.

## What it demonstrates

- Serving the library bundle from `wwwroot/lib` (copied from `dist/` by an
  MSBuild target on every build — no manual copying).
- A block canvas page (`Views/Home/Index.cshtml` + `wwwroot/js/board.js`)
  with undo/redo, zoom controls and server save/load.
- A REST endpoint (`Controllers/BoardApiController.cs`):
  - `GET /api/board` — returns the saved board JSON (204 when empty);
  - `POST /api/board` — validates the engine export format (object with a
    `blocks` array), enforces a size limit and requires the anti-forgery
    token (`X-CSRF-TOKEN` header, issued via a meta tag in the layout).
- `Services/FileBoardStorage.cs` — semaphore-guarded atomic file persistence
  in `App_Data/board.json` (swap `IBoardStorage` for a database in real apps).
- Theming the canvas through the library's CSS variables (`site.css`).

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
loads the saved board from the server or creates a sample one; press
**Save to server** (or Ctrl+S) to persist it.
