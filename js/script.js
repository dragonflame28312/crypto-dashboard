/*
 * Crypto Dashboard Frontend Logic
 *
 * This script fetches live cryptocurrency data and macro news
 * to populate an interactive dashboard. It relies on public
 * APIs such as CoinGecko for market data, Alternative.me for
 * the Fear & Greed index, CryptoCompare for crypto news and
 * GDELT for macro news. Chart.js is used to render the
 * Mayer Multiple trend chart. All requests are performed
 * client‑side to avoid exposing API keys on the server.
 */

// Helper function for generic JSON fetch with error handling
async function fetchJson(url) {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    return await response.json();
  } catch (err) {
    console.error('Fetch error:', err);
    return null;
  }
}

// Update the scrolling ticker with top cryptocurrencies
async function updateTicker() {
  const ticker = document.getElementById('ticker');
  // Ensure ticker-content element exists
  let content = ticker.querySelector('.ticker-content');
  if (!content) {
    content = document.createElement('div');
    content.className = 'ticker-content';
    ticker.appendChild(content);
  }
  const url = 'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=50&page=1&sparkline=false&price_change_percentage=24h';
  const data = await fetchJson(url);
  if (!data) return;
  // Build ticker items
  const items = data.map(coin => {
    const change = coin.price_change_percentage_24h ? coin.price_change_percentage_24h.toFixed(2) : '0.00';
    const sign = change >= 0 ? '+' : '';
    const colour = change >= 0 ? '#2ecc71' : '#e74c3c';
    return `<span class="ticker-item"><strong>${coin.symbol.toUpperCase()}</strong> <span style="color:${colour}">${sign}${change}%</span></span>`;
  }).join(' ');
  // Duplicate items to achieve seamless scroll
  content.innerHTML = items + ' ' + items;
}

// Update Fear & Greed index
async function updateFearGreed() {
  const fearElem = document.getElementById('fearGreedValue');
  // Alternative.me Fear & Greed index
  const url = 'https://api.alternative.me/fng/';
  const data = await fetchJson(url);
  if (!data || !data.data) return;
  const value = data.data[0].value;
  fearElem.textContent = `${value}`;
  const box = document.getElementById('fearGreedBox');
  // Colour box gradually green if greed and red if fear
  const hue = 120 * (value / 100); // 0 = red, 120 = green
  box.style.backgroundColor = `hsl(${hue},60%,35%)`;
  box.title = data.data[0].value_classification;
}

// Fetch altcoin season index from BlockchainCenter; returns null on error
async function fetchAltSeasonFromAPI() {
  try {
    const data = await fetchJson('https://www.blockchaincenter.net/api/altcoin-season-index/');
    if (!data) return null;
    // Try multiple possible keys; the API format can vary
    let index = null;
    if (typeof data.altcoinSeason !== 'undefined') {
      index = Number(data.altcoinSeason);
    } else if (typeof data.season !== 'undefined') {
      index = Number(data.season);
    } else if (typeof data.seasonIndex !== 'undefined') {
      index = Number(data.seasonIndex);
    } else if (data.data) {
      for (const k in data.data) {
        const val = data.data[k];
        if (typeof val === 'number' && val >= 0 && val <= 100) {
          index = val;
          break;
        }
      }
    }
    if (isNaN(index)) return null;
    return index;
  } catch (err) {
    return null;
  }
}

// Compute and display the Altseason index
async function updateAltSeason() {
  const altElem = document.getElementById('altSeasonValue');
  let index = await fetchAltSeasonFromAPI();
  // Fallback to CoinGecko-based calculation if API fails
  if (index === null) {
    const url = 'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=50&page=1&sparkline=false&price_change_percentage=30d';
    const data = await fetchJson(url);
    if (!data) return;
    const btc = data.find(c => c.id === 'bitcoin');
    const btcReturn = btc && btc.price_change_percentage_30d_in_currency ? btc.price_change_percentage_30d_in_currency : 0;
    let totalAlts = 0;
    let count = 0;
    data.forEach(coin => {
      if (coin.id !== 'bitcoin') {
        totalAlts++;
        const change = coin.price_change_percentage_30d_in_currency || 0;
        if (change > btcReturn) count++;
      }
    });
    index = totalAlts ? Math.round((count / totalAlts) * 100) : 0;
  }
  altElem.textContent = `${index}%`;
  const box = document.getElementById('altSeasonBox');
  // 0‑100 → hue 0‑100 (red→green)
  box.style.backgroundColor = `hsl(${index},60%,35%)`;
}

// Update global market cap
async function updateMarketCap() {
  const capElem = document.getElementById('globalCapValue');
  const url = 'https://api.coingecko.com/api/v3/global';
  const data = await fetchJson(url);
  if (!data || !data.data) return;
  const cap = data.data.total_market_cap && data.data.total_market_cap.usd ? data.data.total_market_cap.usd : 0;
  capElem.textContent = `$${Number(cap).toLocaleString(undefined, {maximumFractionDigits: 0})}`;
}

// Compute Mayer Multiple and render chart
async function updateMayer() {
  const mayerElem = document.getElementById('mayerValue');
  // Get market chart for Bitcoin (200 days)
  const url = 'https://api.coingecko.com/api/v3/coins/bitcoin/market_chart?vs_currency=usd&days=200';
  const data = await fetchJson(url);
  if (!data || !data.prices) return;
  const prices = data.prices.map(p => ({ date: new Date(p[0]), price: p[1] }));
  const n = prices.length;
  let average = 0;
  // Calculate 200‑day moving average; if fewer than 200, average over all days
  if (n >= 200) {
    const sum = prices.slice(n - 200).reduce((acc, cur) => acc + cur.price, 0);
    average = sum / 200;
  } else {
    const sum = prices.reduce((acc, cur) => acc + cur.price, 0);
    average = sum / n;
  }
  const currentPrice = prices[n - 1].price;
  const mayerMultiple = currentPrice / average;
  mayerElem.textContent = mayerMultiple.toFixed(2);
  // Build chart data: compute ratio of price to average of last 50 days (for smoother line)
  const chartDates = [];
  const chartMultiples = [];
  const windowSize = 50;
  for (let i = windowSize - 1; i < n; i++) {
    const slice = prices.slice(i - windowSize + 1, i + 1);
    const avg = slice.reduce((acc, cur) => acc + cur.price, 0) / windowSize;
    chartDates.push(prices[i].date.toISOString().slice(0, 10));
    chartMultiples.push(prices[i].price / avg);
  }
  renderMayerChart(chartDates, chartMultiples);
}

// Render Mayer Multiple chart using Chart.js
let mayerChartInstance;
function renderMayerChart(labels, values) {
  const ctx = document.getElementById('mayerChart').getContext('2d');
  if (mayerChartInstance) {
    mayerChartInstance.data.labels = labels;
    mayerChartInstance.data.datasets[0].data = values;
    mayerChartInstance.update();
    return;
  }
  mayerChartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [
        {
          label: 'Mayer Multiple (50‑day MA)',
          data: values,
          borderColor: '#58a6ff',
          backgroundColor: 'rgba(88,166,255,0.2)',
          pointRadius: 0,
          borderWidth: 2,
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: false
        },
        tooltip: {
          callbacks: {
            label: (context) => `Mayer Multiple: ${context.parsed.y.toFixed(2)}`
          }
        }
      },
      scales: {
        x: {
          ticks: {
            maxTicksLimit: 6,
            color: '#a2b5cd'
          },
          grid: { color: '#203867' }
        },
        y: {
          ticks: {
            color: '#a2b5cd'
          },
          grid: { color: '#203867' }
        }
      }
    }
  });
}

// Populate Crypto news
async function loadCryptoNews() {
  const container = document.getElementById('cryptoArticles');
  const url = 'https://min-api.cryptocompare.com/data/v2/news/?lang=EN&sortOrder=latest';
  const json = await fetchJson(url);
  if (!json || !json.Data) return;
  const articles = json.Data.slice(0, 5);
  container.innerHTML = '';
  articles.forEach(article => {
    const card = document.createElement('div');
    card.className = 'article-card';
    const img = document.createElement('img');
    img.src = article.imageurl || 'images/hero.jpg';
    img.alt = article.source;
    const content = document.createElement('div');
    content.className = 'article-content';
    const title = document.createElement('h3');
    title.textContent = article.title;
    const snippet = document.createElement('p');
    snippet.textContent = article.body.slice(0, 120) + '...';
    const link = document.createElement('a');
    link.href = article.url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = 'Read more';
    content.appendChild(title);
    content.appendChild(snippet);
    content.appendChild(link);
    card.appendChild(img);
    card.appendChild(content);
    container.appendChild(card);
  });
}

// Populate Macro news using GDELT
async function loadMacroNews() {
  const container = document.getElementById('macroArticles');
  // Query interest rate and inflation related news for last 3 days
  const start = new Date(Date.now() - 1000 * 60 * 60 * 24 * 3);
  const formatDate = (d) => {
    const yyyy = d.getUTCFullYear().toString();
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(d.getUTCDate()).padStart(2, '0');
    const hh = String(d.getUTCHours()).padStart(2, '0');
    const mi = String(d.getUTCMinutes()).padStart(2, '0');
    const ss = String(d.getUTCSeconds()).padStart(2, '0');
    return `${yyyy}${mm}${dd}${hh}${mi}${ss}`;
  };
  const url = `https://api.gdeltproject.org/api/v2/doc/doc?query=interest%20rate%20OR%20inflation%20OR%20banks%20OR%20england%20OR%20federal%20reserve&mode=ArtList&maxRecords=10&format=json&startdatetime=${formatDate(start)}`;
  const json = await fetchJson(url);
  if (!json || !json.articles) return;
  container.innerHTML = '';
  json.articles.forEach(article => {
    const card = document.createElement('div');
    card.className = 'article-card';
    const img = document.createElement('img');
    img.src = article.image || 'images/hero.jpg';
    img.alt = article.source;
    const content = document.createElement('div');
    content.className = 'article-content';
    const title = document.createElement('h3');
    title.textContent = article.title;
    const snippet = document.createElement('p');
    snippet.textContent = article.snippet ? article.snippet.slice(0, 120) + '...' : '';
    const link = document.createElement('a');
    link.href = article.url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = 'Read more';
    content.appendChild(title);
    content.appendChild(snippet);
    content.appendChild(link);
    card.appendChild(img);
    card.appendChild(content);
    container.appendChild(card);
  });
}

// Apply carousel class to news containers (for horizontal scrolling)
function setupCarousels() {
  document.getElementById('cryptoArticles').classList.add('carousel');
  document.getElementById('macroArticles').classList.add('carousel');
}

// Initialise dashboard
async function initialise() {
  await updateTicker();
  await updateFearGreed();
  await updateAltSeason();
  await updateMarketCap();
  await updateMayer();
  await loadCryptoNews();
  await loadMacroNews();
  setupCarousels();
  // Refresh ticker every minute
  setInterval(updateTicker, 60 * 1000);
  // Refresh fear & greed index every 4 hours
  setInterval(updateFearGreed, 4 * 60 * 60 * 1000);
  // Refresh altseason every 6 hours
  setInterval(updateAltSeason, 6 * 60 * 60 * 1000);
  // Refresh global market cap every hour
  setInterval(updateMarketCap, 60 * 60 * 1000);
  // Refresh Mayer multiple every 6 hours
  setInterval(updateMayer, 6 * 60 * 60 * 1000);
  // Refresh news every 30 minutes
  setInterval(() => {
    loadCryptoNews();
    loadMacroNews();
  }, 30 * 60 * 1000);
}

document.addEventListener('DOMContentLoaded', initialise);
