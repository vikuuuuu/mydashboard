import { NextResponse } from "next/server";

const FALLBACK_QUOTES = {
  AAPL: 219.34,
  MSFT: 468.51,
  VOO: 521.14,
  QQQ: 527.82,
  TSLA: 236.9,
};

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const symbolsParam = searchParams.get("symbols") || "AAPL,MSFT,VOO,QQQ,TSLA";
  const symbols = symbolsParam
    .split(",")
    .map((symbol) => symbol.trim().toUpperCase())
    .filter(Boolean);

  if (!symbols.length) {
    return NextResponse.json({ error: "No symbols provided" }, { status: 400 });
  }

  try {
    const endpoint = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(
      symbols.join(",")
    )}`;

    const response = await fetch(endpoint, {
      next: { revalidate: 20 },
      headers: {
        "User-Agent": "Mozilla/5.0",
      },
    });

    if (!response.ok) {
      throw new Error(`Quote API error: ${response.status}`);
    }

    const payload = await response.json();
    const results = payload?.quoteResponse?.result || [];

    const quotes = symbols.reduce((acc, symbol) => {
      const match = results.find((item) => item.symbol?.toUpperCase() === symbol);
      acc[symbol] = {
        price: Number(match?.regularMarketPrice ?? FALLBACK_QUOTES[symbol] ?? 0),
        change: Number(match?.regularMarketChangePercent ?? 0),
        currency: match?.currency || "USD",
        source: "yahoo",
      };
      return acc;
    }, {});

    return NextResponse.json({ quotes, asOf: new Date().toISOString() });
  } catch {
    const quotes = symbols.reduce((acc, symbol) => {
      const basePrice = FALLBACK_QUOTES[symbol] ?? 100;
      const drift = (Math.random() - 0.5) * 0.6;
      const price = Number((basePrice + drift).toFixed(2));
      acc[symbol] = {
        price,
        change: Number((((price - basePrice) / basePrice) * 100).toFixed(2)),
        currency: "USD",
        source: "fallback",
      };
      return acc;
    }, {});

    return NextResponse.json({
      quotes,
      asOf: new Date().toISOString(),
      note: "Live API unavailable. Fallback data is being used.",
    });
  }
}
