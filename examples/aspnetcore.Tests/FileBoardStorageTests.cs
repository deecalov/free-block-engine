using FreeBlockEngine.Example.Services;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using Xunit;

namespace FreeBlockEngine.Example.Tests;

/// <summary>
/// Unit tests for the file-based storage, run against a throwaway
/// content root so nothing leaks into the example's App_Data.
/// </summary>
public sealed class FileBoardStorageTests : IDisposable
{
    private readonly string _contentRoot;

    public FileBoardStorageTests()
    {
        _contentRoot = Path.Combine(Path.GetTempPath(), $"fbe-tests-{Guid.NewGuid():N}");
        Directory.CreateDirectory(_contentRoot);
    }

    public void Dispose()
    {
        if (Directory.Exists(_contentRoot))
        {
            Directory.Delete(_contentRoot, recursive: true);
        }
    }

    private FileBoardStorage CreateStorage()
    {
        var environment = new Mock<IWebHostEnvironment>();
        environment.SetupGet(e => e.ContentRootPath).Returns(_contentRoot);
        return new FileBoardStorage(environment.Object, NullLogger<FileBoardStorage>.Instance);
    }

    private string BoardFilePath => Path.Combine(_contentRoot, "App_Data", "board.json");

    [Fact]
    public async Task LoadAsync_returns_null_before_anything_is_saved()
    {
        using var storage = CreateStorage();

        Assert.Null(await storage.LoadAsync(CancellationToken.None));
    }

    [Fact]
    public async Task SaveAsync_then_LoadAsync_round_trips_the_payload()
    {
        using var storage = CreateStorage();
        const string board = """{"version":2,"blocks":[]}""";

        await storage.SaveAsync(board, CancellationToken.None);

        Assert.Equal(board, await storage.LoadAsync(CancellationToken.None));
        Assert.True(File.Exists(BoardFilePath));
    }

    [Fact]
    public async Task SaveAsync_leaves_no_temporary_file_behind()
    {
        using var storage = CreateStorage();

        await storage.SaveAsync("""{"blocks":[]}""", CancellationToken.None);

        var leftovers = Directory.GetFiles(Path.Combine(_contentRoot, "App_Data"), "*.tmp");
        Assert.Empty(leftovers);
    }

    [Fact]
    public async Task Concurrent_saves_are_serialized_and_leave_a_complete_file()
    {
        using var storage = CreateStorage();
        var payloads = Enumerable
            .Range(0, 20)
            .Select(i => $$"""{"version":2,"blocks":[{"id":"{{i}}"}]}""")
            .ToArray();

        await Task.WhenAll(payloads.Select(p => storage.SaveAsync(p, CancellationToken.None)));

        // Whichever write landed last, the file must be one intact payload.
        var content = await storage.LoadAsync(CancellationToken.None);
        Assert.Contains(content, payloads);
    }
}
