namespace FreeBlockEngine.Example.Services;

/// <summary>
/// File-based <see cref="IBoardStorage"/>: keeps the board in
/// App_Data/board.json under the content root. Writes are serialized with a
/// semaphore and performed atomically (temp file + move) so a crash cannot
/// leave a half-written board behind.
/// </summary>
public sealed class FileBoardStorage : IBoardStorage, IDisposable
{
    private readonly SemaphoreSlim _gate = new(1, 1);
    private readonly string _filePath;
    private readonly ILogger<FileBoardStorage> _logger;

    public FileBoardStorage(IWebHostEnvironment environment, ILogger<FileBoardStorage> logger)
    {
        _logger = logger;
        var dataDirectory = Path.Combine(environment.ContentRootPath, "App_Data");
        Directory.CreateDirectory(dataDirectory);
        _filePath = Path.Combine(dataDirectory, "board.json");
    }

    /// <inheritdoc />
    public async Task<string?> LoadAsync(CancellationToken cancellationToken)
    {
        await _gate.WaitAsync(cancellationToken);
        try
        {
            if (!File.Exists(_filePath))
            {
                return null;
            }
            return await File.ReadAllTextAsync(_filePath, cancellationToken);
        }
        finally
        {
            _gate.Release();
        }
    }

    /// <inheritdoc />
    public async Task SaveAsync(string json, CancellationToken cancellationToken)
    {
        await _gate.WaitAsync(cancellationToken);
        try
        {
            var tempPath = _filePath + ".tmp";
            await File.WriteAllTextAsync(tempPath, json, cancellationToken);
            File.Move(tempPath, _filePath, overwrite: true);
            _logger.LogInformation(
                "Board saved: {FilePath}, {SizeBytes} bytes at {Timestamp}",
                _filePath,
                json.Length,
                DateTimeOffset.UtcNow);
        }
        finally
        {
            _gate.Release();
        }
    }

    public void Dispose() => _gate.Dispose();
}
