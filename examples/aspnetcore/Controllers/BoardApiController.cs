using System.Text.Json;
using FreeBlockEngine.Example.Services;
using Microsoft.AspNetCore.Mvc;

namespace FreeBlockEngine.Example.Controllers;

/// <summary>
/// REST endpoint for persisting the board produced by the free-block-engine
/// client (<c>engine.exportToJSON()</c> / <c>engine.importFromJSON()</c>).
/// </summary>
[ApiController]
[Route("api/board")]
public sealed class BoardApiController : ControllerBase
{
    private const long MaxBoardSizeBytes = 2_000_000;

    private readonly IBoardStorage _storage;
    private readonly ILogger<BoardApiController> _logger;

    public BoardApiController(IBoardStorage storage, ILogger<BoardApiController> logger)
    {
        _storage = storage;
        _logger = logger;
    }

    /// <summary>Returns the saved board JSON, or 204 when nothing was saved yet.</summary>
    [HttpGet]
    public async Task<IActionResult> Get(CancellationToken cancellationToken)
    {
        var json = await _storage.LoadAsync(cancellationToken);
        if (json is null)
        {
            return NoContent();
        }
        return Content(json, "application/json");
    }

    /// <summary>
    /// Saves the board. The body must be the engine export format:
    /// a JSON object with a "blocks" array. Mutations require the
    /// anti-forgery token (X-CSRF-TOKEN header).
    /// </summary>
    [HttpPost]
    [ValidateAntiForgeryToken]
    [RequestSizeLimit(MaxBoardSizeBytes)]
    public async Task<IActionResult> Save(CancellationToken cancellationToken)
    {
        using var reader = new StreamReader(Request.Body);
        var json = await reader.ReadToEndAsync(cancellationToken);

        if (!IsValidBoardJson(json))
        {
            _logger.LogWarning(
                "Board save rejected: invalid payload, {SizeBytes} bytes at {Timestamp}",
                json.Length,
                DateTimeOffset.UtcNow);
            return BadRequest(new { error = "Body must be a JSON object with a 'blocks' array." });
        }

        await _storage.SaveAsync(json, cancellationToken);
        return NoContent();
    }

    /// <summary>Structural validation of the engine export format.</summary>
    private static bool IsValidBoardJson(string json)
    {
        if (string.IsNullOrWhiteSpace(json))
        {
            return false;
        }
        try
        {
            using var document = JsonDocument.Parse(json);
            return document.RootElement.ValueKind == JsonValueKind.Object
                && document.RootElement.TryGetProperty("blocks", out var blocks)
                && blocks.ValueKind == JsonValueKind.Array;
        }
        catch (JsonException)
        {
            return false;
        }
    }
}
