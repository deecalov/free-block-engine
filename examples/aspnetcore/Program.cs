using FreeBlockEngine.Example.Services;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddControllersWithViews();
builder.Services.AddAntiforgery(options => options.HeaderName = "X-CSRF-TOKEN");
builder.Services.AddSingleton<IBoardStorage, FileBoardStorage>();

var app = builder.Build();

if (!app.Environment.IsDevelopment())
{
    app.UseExceptionHandler("/Home/Index");
}

app.UseStaticFiles();
app.UseRouting();
app.MapDefaultControllerRoute();

app.Run();

/// <summary>
/// Exposed so integration tests can bootstrap the app with
/// <c>WebApplicationFactory&lt;Program&gt;</c>; top-level statements would
/// otherwise generate an internal entry point class.
/// </summary>
public partial class Program;
