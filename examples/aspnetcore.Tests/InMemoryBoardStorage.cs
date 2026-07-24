using FreeBlockEngine.Example.Services;

namespace FreeBlockEngine.Example.Tests;

/// <summary>
/// Test double for <see cref="IBoardStorage"/> so API tests never touch
/// the example's App_Data directory.
/// </summary>
public sealed class InMemoryBoardStorage : IBoardStorage
{
    private string? _json;

    /// <summary>Number of successful saves, for asserting write behaviour.</summary>
    public int SaveCount { get; private set; }

    /// <inheritdoc />
    public Task<string?> LoadAsync(CancellationToken cancellationToken) => Task.FromResult(_json);

    /// <inheritdoc />
    public Task SaveAsync(string json, CancellationToken cancellationToken)
    {
        _json = json;
        SaveCount++;
        return Task.CompletedTask;
    }
}
