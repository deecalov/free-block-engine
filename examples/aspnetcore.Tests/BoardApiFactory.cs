using System.Text.RegularExpressions;
using FreeBlockEngine.Example.Services;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Xunit;

namespace FreeBlockEngine.Example.Tests;

/// <summary>
/// Boots the example app with an in-memory <see cref="IBoardStorage"/>.
/// </summary>
public sealed class BoardApiFactory : WebApplicationFactory<Program>
{
    public InMemoryBoardStorage Storage { get; } = new();

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.ConfigureServices(services =>
        {
            services.RemoveAll<IBoardStorage>();
            services.AddSingleton<IBoardStorage>(Storage);
        });
    }
}

/// <summary>Helpers for driving the anti-forgery protected endpoint.</summary>
public static class AntiforgeryClient
{
    private static readonly Regex TokenPattern = new(
        """<meta\s+name="csrf-token"\s+content="(?<token>[^"]+)"\s*/?>""",
        RegexOptions.Compiled);

    /// <summary>
    /// Requests the board page so the client picks up the anti-forgery cookie,
    /// and returns the request token rendered into the page.
    /// </summary>
    public static async Task<string> GetTokenAsync(HttpClient client)
    {
        var html = await client.GetStringAsync("/");
        var match = TokenPattern.Match(html);
        Assert.True(match.Success, "The layout should render a csrf-token meta tag.");
        return match.Groups["token"].Value;
    }
}
