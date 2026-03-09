import time
import re
import asyncio

from dotenv import load_dotenv  
import os   

import pandas as pd

load_dotenv()  # Load environment variables from .env file

FIRECRAWL_KEY = os.getenv("FIRECRAWL_KEY")
CRAWL4AI_KEY = os.getenv("CRAWL4AI_KEY")
APIFY_KEY = os.getenv("APIFY_KEY")


TEST_URL = "https://en.wikipedia.org/wiki/Artificial_intelligence"


def score_quality(text):
    if not text or len(text) < 50:
        return 0.0
    score = 0
    score += min(3, len(text) / 2000)   
    
    """
        | Part | Meaning |
        |---|---|
        | `^` | Start of a line |
        | `#` | Literal `#` character |
        | `{1,6}` | Repeat `#` between 1 and 6 times |
        | `\s` | Any whitespace (space/tab) after the `#` |
        | `re.M` | Makes `^` match start of **every line**, not just the whole string |
    """
    score += min(2, len(re.findall(r'^#{1,6}\s', text, re.M)) * 0.4)  # headers
    
    """
        | Part | Meaning |
        |---|---|
        | `\[` | Literal `[` (escaped because `[` is special in regex) |
        | `.+?` | Any character(s), **lazily** (as few as possible) |
        | `\]` | Literal `]` |
        | `\(` | Literal `(` |
        | `http` | Literal "http" |
        | `s?` | Optional `s` — matches both `http` and `https` |
        | `://` | Literal `://` |

        **Matches:**
        ````
        [Click here](https://example.com)  Right
        [Google](http://google.com)        Right
        [OpenAI](https://openai.com/about)  Right
        [No link](just-text)                Wrong  (no http://)
        plain text                          Wrong  (no brackets)
"""
    score += min(2, len(re.findall(r'\[.+?\]\(https?://', text)) * 0.2)  # links
    
    
    """
        | Part | Meaning |
        |---|---|
        | `^` | Start of a line |
        | `[` `]` | A **character class** — matches ONE character from inside |
        | `\-` | Literal `-` (escaped inside `[]`) |
        | `\*` | Literal `*` (escaped inside `[]`) |
        | `\s` | Whitespace after the bullet |
        | `re.M` | `^` matches start of every line |
            
        - First item    
        * Second item   
    """
    score += min(2, len(re.findall(r'^[\-\*]\s', text, re.M)) * 0.2)    # lists
    score += min(1, text.count("```") * 0.5)                       # code blocks
    return round(min(10.0, score), 2)


def run_firecrawl(url):
    try:
        from firecrawl import FirecrawlApp
        app = FirecrawlApp(api_key=FIRECRAWL_KEY)
        start = time.perf_counter()
        job = app.scrape(url, formats=['markdown'])
        elapsed = round(time.perf_counter() - start, 2)
        content = job.markdown
        return {"success": True, "time": elapsed, "quality": score_quality(content), "chars": len(content)}
    except Exception as e:
        return {"success": False, "error": str(e)[:60]}


async def run_crawl4ai(url):
    try:
        from crawl4ai import AsyncWebCrawler
        start = time.perf_counter()
        async with AsyncWebCrawler(verbose=False) as crawler:
            res = await crawler.arun(url=url)
        elapsed = round(time.perf_counter() - start, 2)
        content = res.markdown or ""
        return {"success": res.success, "time": elapsed, "quality": score_quality(content), "chars": len(content)}
    except Exception as e:
        return {"success": False, "error": str(e)[:60]}


def run_apify(url):
    try:
        from apify_client import ApifyClient
        client = ApifyClient(APIFY_KEY)
        start = time.perf_counter()
        run = client.actor("apify/website-content-crawler").call(
            run_input={"startUrls": [{"url": url}], "maxCrawlPages": 1}
        )
        items = list(client.dataset(run["defaultDatasetId"]).iterate_items())
        elapsed = round(time.perf_counter() - start, 2)
        content = items[0].get("markdown", "") if items else ""
        return {"success": bool(content), "time": elapsed, "quality": score_quality(content), "chars": len(content)}
    except Exception as e:
        return {"success": False, "error": str(e)[:60]}

def print_row(name, result):
    if result.get("success"):
        print(f"  {'Executed'} {name:<16} | ⏱  {result['time']:>6}s | Quality: {result['quality']}/10 | 📄 {result['chars']:,} chars")
    else:
        print(f"  {'NOT EXECUTED'} {name:<16} | Error: {result.get('error', 'unknown')}")


async def main():
    print("\n AI Crawling Benchmark")
    print(f"   URL: {TEST_URL}\n")
    print("─" * 65)

    results = {}

    # Run all tools
    print("Running benchmarks...\n")

    if FIRECRAWL_KEY != "YOUR_FIRECRAWL_API_KEY":
        results["Firecrawl"] = run_firecrawl(TEST_URL)
    else:
        results["Firecrawl"] = {"success": False, "error": "API key not set"}

    results["Crawl4AI"] = await run_crawl4ai(TEST_URL)

    if APIFY_KEY != "YOUR_APIFY_API_KEY":
        results["Apify"] = run_apify(TEST_URL)
    else:
        results["Apify"] = {"success": False, "error": "API key not set"}

    print("─" * 65)
    print(f"  {'':2} {'Tool':<16} | {'Speed':>8} | {'Quality':>14} | {'Content'}")
    print("─" * 65)
    for name, result in results.items():
        print_row(name, result)
    print("─" * 65)
    
    df = pd.DataFrame.from_dict(results, orient='index')   
    df.to_csv("crawler_benchmark_results.csv")

    # Winner
    successful = {k: v for k, v in results.items() if v.get("success")}
    if successful:
        fastest = min(successful, key=lambda k: successful[k]["time"])
        best_quality = max(successful, key=lambda k: successful[k]["quality"])
        print(f"\n Fastest   : {fastest} ({successful[fastest]['time']}s)")
        print(f"Best Quality: {best_quality} ({successful[best_quality]['quality']}/10)\n")


if __name__ == "__main__":
    asyncio.run(main())