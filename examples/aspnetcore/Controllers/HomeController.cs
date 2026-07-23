using Microsoft.AspNetCore.Mvc;

namespace FreeBlockEngine.Example.Controllers;

/// <summary>Serves the block board page.</summary>
public sealed class HomeController : Controller
{
    [HttpGet]
    public IActionResult Index() => View();
}
