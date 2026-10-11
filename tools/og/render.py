# OGP 画像を書き出す：python3 tools/og/render.py  →  assets/og.png と assets/og-en.png（1200×630）
import asyncio, pathlib
from playwright.async_api import async_playwright
ROOT = pathlib.Path(__file__).resolve().parents[2]
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await b.new_page(viewport={"width": 1200, "height": 630}, device_scale_factor=1)
        await pg.goto((ROOT / "tools/og/og.html").as_uri())
        await pg.evaluate("""Promise.all([
          document.fonts.load('800 40px "Shippori Mincho B1"', '話'), document.fonts.load('700 40px "Shippori Mincho B1"', 'すと'),
          document.fonts.load('900 40px "Zen Kaku Gothic New"', 'リアルタイム'), document.fonts.load('700 40px "Zen Kaku Gothic New"', '無料'),
          document.fonts.load('500 40px "Zen Kaku Gothic New"', 'ひとり'), document.fonts.load('500 14px "IBM Plex Mono"', 'ON AIR')])""")
        await pg.evaluate("document.fonts.ready")
        await pg.wait_for_timeout(800)
        ok = await pg.evaluate("document.fonts.check('800 40px \"Shippori Mincho B1\"', '話') && document.fonts.check('900 40px \"Zen Kaku Gothic New\"', 'リ')")
        if not ok: raise SystemExit("Shippori Mincho B1 が読み込めませんでした")
        await pg.screenshot(path=str(ROOT / "assets/og.png"))
        # 英語版
        await pg.goto((ROOT / "tools/og/og-en.html").as_uri())
        await pg.evaluate("""Promise.all([
          document.fonts.load('700 92px "Fraunces"', 'Speak'), document.fonts.load('600 17px "Inter"', 'Free'),
          document.fonts.load('900 40px "Zen Kaku Gothic New"', 'リアルタイム'), document.fonts.load('500 15px "Inter"', 'Even'),
          document.fonts.load('500 14px "IBM Plex Mono"', 'ON AIR')])""")
        await pg.evaluate("document.fonts.ready")
        await pg.wait_for_timeout(800)
        if not await pg.evaluate("document.fonts.check('700 92px \"Fraunces\"', 'S')"): raise SystemExit("Fraunces が読み込めませんでした")
        await pg.screenshot(path=str(ROOT / "assets/og-en.png"))
        await b.close()
asyncio.run(main())
