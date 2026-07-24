using System.Net;
using System.Text;
using Xunit;

namespace FreeBlockEngine.Example.Tests;

/// <summary>
/// Integration tests for the board REST endpoint: empty state, anti-forgery
/// protection, payload validation and the save/load round-trip.
/// </summary>
public sealed class BoardApiTests : IClassFixture<BoardApiFactory>
{
    private const string ValidBoard =
        """{"version":2,"blocks":[{"id":"one","content":"hello"}],"settings":{"gridSize":20}}""";

    private readonly BoardApiFactory _factory;

    public BoardApiTests(BoardApiFactory factory) => _factory = factory;

    private static StringContent JsonBody(string json) =>
        new(json, Encoding.UTF8, "application/json");

    [Fact]
    public async Task Get_returns_no_content_when_nothing_was_saved()
    {
        using var factory = new BoardApiFactory();
        using var client = factory.CreateClient();

        var response = await client.GetAsync("/api/board");

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
    }

    [Fact]
    public async Task Post_without_antiforgery_token_is_rejected()
    {
        using var factory = new BoardApiFactory();
        using var client = factory.CreateClient();

        var response = await client.PostAsync("/api/board", JsonBody(ValidBoard));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal(0, factory.Storage.SaveCount);
    }

    [Fact]
    public async Task Post_with_token_saves_the_board_and_get_returns_it()
    {
        using var factory = new BoardApiFactory();
        using var client = factory.CreateClient();
        var token = await AntiforgeryClient.GetTokenAsync(client);

        using var request = new HttpRequestMessage(HttpMethod.Post, "/api/board")
        {
            Content = JsonBody(ValidBoard),
        };
        request.Headers.Add("X-CSRF-TOKEN", token);
        var saveResponse = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.NoContent, saveResponse.StatusCode);
        Assert.Equal(1, factory.Storage.SaveCount);

        var loadResponse = await client.GetAsync("/api/board");
        Assert.Equal(HttpStatusCode.OK, loadResponse.StatusCode);
        Assert.Equal(
            "application/json",
            loadResponse.Content.Headers.ContentType?.MediaType);
        Assert.Equal(ValidBoard, await loadResponse.Content.ReadAsStringAsync());
    }

    [Theory]
    [InlineData("""{"foo":1}""")] // no "blocks" array
    [InlineData("""{"blocks":"not-an-array"}""")]
    [InlineData("not json at all")]
    [InlineData("[]")] // array root instead of an object
    [InlineData("")]
    public async Task Post_rejects_payloads_that_are_not_a_board(string payload)
    {
        using var factory = new BoardApiFactory();
        using var client = factory.CreateClient();
        var token = await AntiforgeryClient.GetTokenAsync(client);

        using var request = new HttpRequestMessage(HttpMethod.Post, "/api/board")
        {
            Content = new StringContent(payload, Encoding.UTF8, "application/json"),
        };
        request.Headers.Add("X-CSRF-TOKEN", token);
        var response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal(0, factory.Storage.SaveCount);
    }

    [Fact]
    public async Task Board_page_renders_the_engine_bundle_and_a_token()
    {
        using var client = _factory.CreateClient();

        var response = await client.GetAsync("/");
        var html = await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Contains("free-block-engine.global.js", html);
        Assert.Contains("csrf-token", html);
        Assert.NotNull(response.Content.Headers.ContentType);
        Assert.Equal("text/html", response.Content.Headers.ContentType!.MediaType);
    }

    [Fact]
    public async Task Saving_twice_overwrites_the_previous_board()
    {
        using var factory = new BoardApiFactory();
        using var client = factory.CreateClient();
        var token = await AntiforgeryClient.GetTokenAsync(client);
        const string second = """{"version":2,"blocks":[]}""";

        foreach (var payload in new[] { ValidBoard, second })
        {
            using var request = new HttpRequestMessage(HttpMethod.Post, "/api/board")
            {
                Content = JsonBody(payload),
            };
            request.Headers.Add("X-CSRF-TOKEN", token);
            var response = await client.SendAsync(request);
            Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        }

        var loaded = await client.GetStringAsync("/api/board");
        Assert.Equal(second, loaded);
        Assert.Equal(2, factory.Storage.SaveCount);
    }
}
