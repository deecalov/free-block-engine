namespace FreeBlockEngine.Example.Services;

/// <summary>
/// Persists the serialized block board (the JSON produced by
/// <c>engine.exportToJSON()</c> on the client).
/// </summary>
public interface IBoardStorage
{
    /// <summary>Loads the saved board JSON, or null when nothing was saved yet.</summary>
    Task<string?> LoadAsync(CancellationToken cancellationToken);

    /// <summary>Saves the board JSON, replacing the previous version.</summary>
    Task SaveAsync(string json, CancellationToken cancellationToken);
}
