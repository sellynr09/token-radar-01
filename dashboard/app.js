// Token Radar's dashboard. It reads window.RADAR (written beside dashboard/ by main.ts) and
// renders the ranked board, a filterable table, a per-protocol detail drawer with the model's own
// inputs and the protocol's farm plan. No network: every byte it shows is in data.js.
//
// The pure functions at the top are the same derivation main.ts writes to board.json: the model
// in impliedOf, and the farm plan in farmSteps. The page recomputes a row from the snapshot
// figures and checks the number board.json carries, so the page's code and the board's data are
// visibly the same arithmetic. They are top-level so a test harness can load this file without a
// DOM and compare them against lib/model.ts row for row.

var usdFmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
function fmtUsd(n) {
  if (n === null || n === undefined || !isFinite(n)) return 'n/a';
  if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
  if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
  if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
  return usdFmt.format(n);
}
function fmtPct(n) {
  if (n === null || n === undefined || !isFinite(n)) return 'n/a';
  return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
}
function fmtAge(days) {
  if (days === null || days === undefined) return 'unknown';
  if (days >= 365) return (days / 365).toFixed(1) + 'y';
  return Math.max(0, Math.round(days)) + 'd';
}

/** The model in one function: TVL x base, growth, maturity — the same as lib/model.ts. */
function impliedOf(row, model) {
  var growth = Math.min(model.growth_cap, Math.max(model.growth_floor, row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d));
  var growthMult = 1 + (growth / 100) * model.growth_weight;
  var age = row.age_days === null || row.age_days === undefined ? model.unknown_age_days : row.age_days;
  var maturity = model.maturity_floor + (Math.min(Math.max(age, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
  return Math.max(1, Math.round(row.tvl_usd * model.base_multiple * growthMult * maturity));
}

/** The farm plan is the same derivation main.ts writes to board.json: category, chains, TVL and
    age decide the action, the capital, the hold and every cost and time. No name is special-cased. */
function chainOf(p) { return p.chains && p.chains.length > 0 ? p.chains[0] : 'its main chain'; }
function capitalFor(p) {
  if (p.tvl_usd >= 5e9) return 250;
  if (p.tvl_usd >= 1e9) return 150;
  if (p.tvl_usd >= 1e8) return 100;
  return 50;
}
function holdDaysFor(age) {
  if (age === null || age === undefined) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}
function actionFor(p, capital, chain) {
  var c = (p.category || '').toLowerCase();
  var name = p.name;
  if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Supply $' + capital + ' of USDC to ' + name + ' on ' + chain + ' and keep the position open.';
  if (c.indexOf('dex') >= 0 || c.indexOf('yield') >= 0 || c.indexOf('leveraged farm') >= 0) return 'Provide $' + capital + ' of liquidity to ' + name + "'s main pool on " + chain + ' and keep the position open.';
  if (c.indexOf('bridge') >= 0) return 'Bridge $' + capital + ' of USDC to ' + chain + ' through ' + name + ' and use the bridged funds in its app.';
  if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return "Stake $" + capital + " of the chain's staking asset through " + name + ' and keep the receipt token.';
  if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0) return 'Deposit $' + capital + ' of USDC as margin on ' + name + ' and open one small hedged position.';
  if (c.indexOf('prediction') >= 0) return 'Fund $' + capital + ' and place one market position on ' + name + '.';
  if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0) return 'Deposit $' + capital + ' into a ' + name + ' vault on ' + chain + ' and keep the shares.';
  if (c.indexOf('stable') >= 0) return 'Mint or deposit $' + capital + ' of the stable asset through ' + name + ' on ' + chain + '.';
  if (c.indexOf('rwa') >= 0) return "Mint $" + capital + " of the protocol's yield-bearing asset on " + chain + ' and hold it.';
  if (c.indexOf('insurance') >= 0) return 'Buy $' + capital + ' of cover from ' + name + ' on ' + chain + ' and keep the policy active.';
  if (c.indexOf('basis') >= 0) return "Deposit $" + capital + " into " + name + "'s basis trade on " + chain + ' and keep the position open.';
  if (c.indexOf('chain') >= 0) return 'Bridge $' + capital + ' of USDC to ' + chain + ' through ' + name + " and use it in the chain's main app.";
  return 'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and keep the position open.';
}
function secondActionFor(p, capital, chain) {
  var c = (p.category || '').toLowerCase();
  var name = p.name;
  var small = Math.max(10, Math.round(capital / 5));
  if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Borrow $' + small + ' against the supply on ' + name + ', then repay it in full, so the wallet shows both sides of the market.';
  if (c.indexOf('dex') >= 0 || c.indexOf('yield') >= 0 || c.indexOf('leveraged farm') >= 0) return 'Swap $' + small + ' through ' + name + "'s main pool on " + chain + ', then add the proceeds back as liquidity.';
  if (c.indexOf('bridge') >= 0) return 'Bridge $' + small + ' back the other way through ' + name + ', so the wallet shows two-way use.';
  if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return 'Unstake $' + small + ' through ' + name + ' and restake it, so the wallet shows an active stake.';
  if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0) return 'Close the first hedge on ' + name + ' and open one more small position, so the wallet shows repeated use.';
  if (c.indexOf('prediction') >= 0) return 'Settle the first market position on ' + name + ' and place a second one.';
  if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0) return 'Move $' + small + ' between two of ' + name + "'s vaults on " + chain + '.';
  if (c.indexOf('stable') >= 0) return 'Redeem $' + small + ' of the stable asset from ' + name + ' and mint it again.';
  if (c.indexOf('rwa') >= 0) return 'Claim any yield the $' + capital + ' position earned on ' + name + ' and compound it back in.';
  if (c.indexOf('insurance') >= 0) return 'Open a test claim inquiry on the ' + name + ' policy page, then keep the cover.';
  if (c.indexOf('basis') >= 0) return 'Open a $' + small + ' basis position in the other direction on ' + name + ' and close it.';
  if (c.indexOf('chain') >= 0) return 'Use a second app on ' + chain + ', such as its main DEX or lending market, from the same wallet.';
  return 'Make a second deposit of $' + small + ' into ' + name + ' on ' + chain + ' a week after the first.';
}
function stepText(step) {
  var s = step.text + ' Cost: ' + step.cost + '. Time: ' + step.time + '.';
  if (s.length > 600) s = s.slice(0, 596) + '...';
  if (s.length < 20) s = s + " Hold the position and check the protocol's own page.";
  return s;
}
function farmSteps(p) {
  var chain = chainOf(p);
  var capital = capitalFor(p);
  var hold = holdDaysFor(p.age_days);
  return [
    { text: 'Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.', cost: 'under $3 of gas for the first transaction', time: '5 minutes' },
    { text: actionFor(p, capital, chain), cost: '$' + capital + ' of capital and about $' + (capital >= 150 ? 8 : 4) + ' of gas', time: '15 minutes to set up' },
    { text: secondActionFor(p, capital, chain), cost: 'about $' + (capital >= 150 ? 4 : 2) + ' of gas', time: '10 minutes' },
    { text: 'Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote.', cost: 'about $2 of gas a week', time: '10 minutes a week' },
    { text: 'Hold the position for at least ' + hold + ' days so the activity is counted in more than one snapshot.', cost: 'the $' + capital + ' stays in the position', time: hold + ' days' },
    { text: "Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes.", cost: 'no fee to check, and never pay to claim', time: '10 minutes' },
    { text: 'Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.', cost: 'nothing but the log', time: '5 minutes' }
  ].map(stepText);
}

(function () {
  'use strict';
  var DATA = (typeof window !== 'undefined' && window.RADAR) || null;
  if (!DATA || typeof document === 'undefined') return;
  var app = document.getElementById('board');
  if (!app) return;
  var state = { q: '', category: 'all', chain: 'all', minTvl: 0, tab: 'pre-token', sort: 'implied', dir: -1, selected: null };

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var params = new URLSearchParams(hash);
    if (params.get('q')) state.q = params.get('q');
    if (params.get('category')) state.category = params.get('category');
    if (params.get('chain')) state.chain = params.get('chain');
    if (params.get('mintvl')) state.minTvl = Number(params.get('mintvl')) || 0;
    if (params.get('tab')) state.tab = params.get('tab');
    if (params.get('p')) state.selected = params.get('p');
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.chain !== 'all') params.set('chain', state.chain);
    if (state.minTvl) params.set('mintvl', String(state.minTvl));
    if (state.tab !== 'pre-token') params.set('tab', state.tab);
    if (state.selected) params.set('p', state.selected);
    var next = params.toString();
    if (next) window.history.replaceState(null, '', '#' + next);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  function rows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.category !== 'all' && (r.category || 'Other') !== state.category) return false;
      if (state.chain !== 'all' && (r.chains || []).indexOf(state.chain) < 0) return false;
      if (state.minTvl && r.tvl_usd < state.minTvl) return false;
      if (!q) return true;
      var hay = [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }
  function sortedRows(list) {
    var key = state.sort;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? Infinity : a.age_days; bv = b.age_days === null ? Infinity : b.age_days; }
      else { av = a.implied_value_usd; bv = b.implied_value_usd; }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }

  function header() {
    return el('header', { class: 'top' },
      el('div', { class: 'brand' },
        el('span', { class: 'mark' }),
        el('span', { class: 'brand-name' }, el('b', { text: 'Token Radar' }), ' — pre-token protocols, ranked')
      ),
      el('div', { class: 'top-meta' },
        el('span', { class: 'pill', text: 'Snapshot ' + DATA.as_of }),
        el('span', { class: 'pill', text: DATA.model_version + ' model' }),
        el('span', { class: 'pill', text: 'DefiLlama protocol index' })
      )
    );
  }

  function lede() {
    return el('section', { class: 'lede' },
      el('span', { class: 'kicker', text: 'Token launch radar' }),
      el('h1', { text: DATA.watchlist_size + ' watchlist protocols, ranked by implied value' }),
      el('p', { text: 'The watchlist is the floor: every protocol with at least $' + Math.round(DATA.floor_usd / 1e6) + 'M of TVL and no token on record. The early radar adds ' + DATA.early_size + ' pre-token protocols below that floor, every one the snapshot carries. Implied value is a model of what a token would be worth if the protocol kept its record, not a prediction that one launches, and not a price.' })
    );
  }

  function tile(label, value, note) {
    return el('div', { class: 'tile' },
      el('span', { text: label }),
      el('b', { text: value }),
      el('em', { text: note })
    );
  }
  function tiles() {
    return el('section', { class: 'tiles', 'aria-label': 'Board at a glance' },
      tile('Rows scored', String(DATA.board_size), DATA.watchlist_size + ' watchlist + ' + DATA.early_size + ' early'),
      tile('Watchlist covered', DATA.watchlist_size + ' / ' + DATA.watchlist_size, fmtUsd(DATA.watchlist_tvl_usd) + ' of TVL'),
      tile('Pre-token in snapshot', String(DATA.pre_token_count), 'of ' + DATA.protocol_count + ' protocols in the snapshot'),
      tile('Live-token set aside', String(DATA.live_size), 'already trading, by market cap'),
      tile('Median board TVL', fmtUsd(DATA.median_tvl_usd), 'across the ranked rows'),
      tile('Median 7d change', fmtPct(DATA.median_change_7d), 'the week ran down'),
      tile('Top implied value', fmtUsd(DATA.top_implied_usd), 'rank 1 of the board'),
      tile('Live market caps', fmtUsd(DATA.live.length ? DATA.live[0].mcap_usd : null), 'largest token that trades')
    );
  }

  function controls() {
    var categories = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    var chains = Array.from(new Set(DATA.rows.reduce(function (acc, r) { return acc.concat(r.chains || []); }, []))).sort();
    var tvlOptions = [[0, 'Any TVL'], [5e7, 'At least $50M'], [1e8, 'At least $100M'], [5e8, 'At least $500M'], [1e9, 'At least $1B']];
    var search = el('input', { type: 'search', id: 'q', placeholder: 'Search name, category or chain', value: state.q, 'aria-label': 'Search the board' });
    search.addEventListener('input', function () { state.q = search.value; writeHash(); render(); });
    var cat = el('select', { id: 'category', 'aria-label': 'Filter by category' },
      el('option', { value: 'all', text: 'All categories' }),
      categories.map(function (c) { return el('option', { value: c, text: c, selected: c === state.category ? 'selected' : null }); })
    );
    cat.addEventListener('change', function () { state.category = cat.value; writeHash(); render(); });
    var chain = el('select', { id: 'chain', 'aria-label': 'Filter by chain' },
      el('option', { value: 'all', text: 'All chains' }),
      chains.map(function (c) { return el('option', { value: c, text: c, selected: c === state.chain ? 'selected' : null }); })
    );
    chain.addEventListener('change', function () { state.chain = chain.value; writeHash(); render(); });
    var mintvl = el('select', { id: 'mintvl', 'aria-label': 'Filter by minimum TVL' },
      tvlOptions.map(function (o) { return el('option', { value: String(o[0]), text: o[1], selected: o[0] === state.minTvl ? 'selected' : null }); })
    );
    mintvl.addEventListener('change', function () { state.minTvl = Number(mintvl.value) || 0; writeHash(); render(); });
    var pre = el('button', { type: 'button', 'aria-pressed': state.tab === 'pre-token' ? 'true' : 'false', text: 'Pre-token', onclick: function () { state.tab = 'pre-token'; render(); } });
    var live = el('button', { type: 'button', 'aria-pressed': state.tab === 'live' ? 'true' : 'false', text: 'Live token', onclick: function () { state.tab = 'live'; render(); } });
    return el('div', { class: 'controls' },
      el('div', { class: 'field' }, el('label', { for: 'q', text: 'Search' }), search),
      el('div', { class: 'field' }, el('label', { for: 'category', text: 'Category' }), cat),
      el('div', { class: 'field' }, el('label', { for: 'chain', text: 'Chain' }), chain),
      el('div', { class: 'field' }, el('label', { for: 'mintvl', text: 'Minimum TVL' }), mintvl),
      el('div', { class: 'field' }, el('span', { class: 'sub', text: 'Token status' }), el('div', { class: 'tabs' }, pre, live)),
      el('span', { class: 'count', text: state.tab === 'pre-token' ? rows().length + ' rows shown' : DATA.live.length + ' live-token protocols' })
    );
  }

  function sortHeader(key, label) {
    return el('th', { scope: 'col' },
      el('button', { type: 'button', onclick: function () { if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = -1; } render(); } },
        label,
        state.sort === key ? el('span', { 'aria-hidden': 'true', text: state.dir < 0 ? ' v' : ' ^' }) : null
      )
    );
  }

  function boardTable() {
    var list = sortedRows(rows());
    if (list.length === 0) {
      return el('div', { class: 'panel' }, el('div', { class: 'empty' },
        el('h2', { text: 'No protocol matches that filter' }),
        el('p', { text: 'Clear the search or pick another category to see the board again.' }),
        el('button', { class: 'button primary', type: 'button', text: 'Clear filters', onclick: function () { state.q = ''; state.category = 'all'; state.chain = 'all'; state.minTvl = 0; writeHash(); render(); } })
      ));
    }
    var max = DATA.top_implied_usd || 1;
    var tbody = el('tbody');
    list.forEach(function (r) {
      var growth = r.change_7d === null ? 'n/a' : fmtPct(r.change_7d);
      var growthClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      var tr = el('tr', {
        'data-selected': state.selected === r.slug ? 'true' : 'false',
        tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } }
      },
        el('td', { class: 'num', text: String(r.rank) }),
        el('td', null, el('div', { class: 'name' },
          el('b', { text: r.name }),
          el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') })
        )),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + growthClass, text: growth }),
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', null, el('div', { class: 'implied' },
          el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(3, Math.round((r.implied_value_usd / max) * 100)) + '%' })),
          el('span', { class: 'num', text: fmtUsd(r.implied_value_usd) })
        )),
        el('td', null, el('span', { class: r.watchlist ? 'badge watch' : 'badge', text: r.watchlist ? 'Watchlist' : 'Early' }))
      );
      tbody.appendChild(tr);
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Pre-token protocols, strongest implied value first. Select a row for its model and farm plan.' }),
          el('thead', null, el('tr', null,
            sortHeader('implied', 'Rank'),
            sortHeader('name', 'Protocol'),
            sortHeader('tvl', 'TVL'),
            sortHeader('growth', '7d'),
            sortHeader('age', 'Age'),
            sortHeader('implied', 'Implied value'),
            el('th', { scope: 'col', text: 'List' })
          )),
          tbody
        )
      )
    );
  }

  function liveTable() {
    var tbody = el('tbody');
    DATA.live.forEach(function (r) {
      tbody.appendChild(el('tr', { 'data-static': 'true' },
        el('td', { class: 'num', text: 'live' }),
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') }))),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
        el('td', null, el('span', { class: 'badge live', text: 'Already trades' }))
      ));
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Token live: these protocols already trade, so their market cap is a fact, not a model. They are set aside from the pre-token ranking.' }),
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Status' }), el('th', { scope: 'col', text: 'Protocol' }), el('th', { scope: 'col', text: 'TVL' }), el('th', { scope: 'col', text: '7d' }), el('th', { scope: 'col', text: 'Market cap' }), el('th', { scope: 'col', text: 'Token' }))),
          tbody
        )
      )
    );
  }

  function modelPanel() {
    var m = DATA.model;
    var top = DATA.rows[0];
    return el('section', { class: 'panel model' },
      el('h2', { text: 'How implied value is computed' }),
      el('p', { class: 'sub', text: 'One function scores every row from the snapshot figures. No protocol name is special-cased, and no row is hand-picked.' }),
      el('div', { class: 'formula' },
        'implied = round( tvl_usd x ' + m.base_multiple + ' x (1 + clamp(change_7d, ' + m.growth_floor + ', ' + m.growth_cap + ') / 100 x ' + m.growth_weight + ') x (' + m.maturity_floor + ' + min(age_days, ' + m.maturity_days + ') / ' + m.maturity_days + ' x ' + m.maturity_range + ') )'
      ),
      el('div', { class: 'model-grid' },
        el('div', { class: 'model-cell' }, el('b', { text: 'TVL is the anchor' }), el('span', { text: 'A token scales with the value already locked in the protocol, so the largest pre-token pools head the board.' })),
        el('div', { class: 'model-cell' }, el('b', { text: 'Growth moves ranks' }), el('span', { text: 'The median protocol lost 8.2% of TVL in the week, so one still growing stands out; a single hot week cannot buy the top.' })),
        el('div', { class: 'model-cell' }, el('b', { text: 'Age is the record' }), el('span', { text: 'Age is the time since first listing, the best record of how long a protocol has run with no token; an unknown age counts as ' + m.unknown_age_days + ' days.' }))
      ),
      top ? el('p', { class: 'sub', text: 'Worked example, rank 1: ' + top.name + ' holds ' + fmtUsd(top.tvl_usd) + ' of TVL, ' + fmtPct(top.change_7d) + ' over seven days, ' + fmtAge(top.age_days) + ' with no token on record, so the model reads ' + fmtUsd(top.implied_value_usd) + '.' }) : null,
      el('p', { class: 'sub', text: 'This is an estimate, never a price, and it says nothing about whether or when a token launches. A protocol "records no token" when the snapshot carries none for it, not that it has none.' })
    );
  }

  var dialog = el('dialog', { class: 'detail', id: 'detail', 'aria-labelledby': 'detail-title' });
  dialog.addEventListener('close', function () { state.selected = null; writeHash(); });

  function openDetail(slug) {
    var row = DATA.rows.filter(function (r) { return r.slug === slug; })[0];
    if (!row) return;
    state.selected = slug;
    writeHash();
    dialog.textContent = '';
    var steps = farmSteps(row);
    dialog.appendChild(el('div', { class: 'detail-head' },
      el('div', null,
        el('span', { class: 'brand-name', text: 'Rank ' + row.rank + ' of ' + DATA.board_size + (row.watchlist ? ' · Watchlist' : ' · Early') }),
        el('h2', { id: 'detail-title', text: row.name }),
        el('p', { class: 'sub', text: (row.category || 'Other') + ' on ' + (row.chains && row.chains.length ? row.chains.join(', ') : 'an unnamed chain') + ' · listed ' + (row.listed_at || 'on an unknown date') })
      ),
      el('button', { class: 'close', type: 'button', 'aria-label': 'Close details', text: 'Close', onclick: function () { dialog.close(); } })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Implied value' }),
      el('div', { class: 'equation' },
        el('div', null, el('span', { text: 'TVL' }), el('b', { class: 'num', text: fmtUsd(row.tvl_usd) })),
        el('div', null, el('span', { text: 'Seven-day growth' }), el('b', { class: 'num', text: fmtPct(row.change_7d) })),
        el('div', null, el('span', { text: 'Age with no token' }), el('b', { class: 'num', text: fmtAge(row.age_days) })),
        el('div', null, el('span', { text: 'Growth multiplier' }), el('b', { class: 'num', text: String(row.growth_multiplier) })),
        el('div', null, el('span', { text: 'Maturity multiplier' }), el('b', { class: 'num', text: String(row.maturity_multiplier) })),
        el('div', null, el('span', { text: 'Implied value' }), el('b', { class: 'num', text: fmtUsd(row.implied_value_usd) }))
      ),
      el('p', { class: 'sub', text: 'Model ' + DATA.model_version + ': the same function scores every protocol. The page recomputes this row as ' + fmtUsd(impliedOf(row, DATA.model)) + (impliedOf(row, DATA.model) === row.implied_value_usd ? ', the same number board.json carries.' : ', which differs from the board: the data would be stale.') + ' This is an estimate, not a price.' })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Farm plan' }),
      el('ol', { class: 'steps' }, steps.map(function (s) {
        var at = s.indexOf(' Cost: ');
        var action = at >= 0 ? s.slice(0, at) : s;
        var tail = at >= 0 ? s.slice(at + 1) : '';
        return el('li', null, el('b', { text: action }), el('span', { class: 'cost', text: tail }));
      }))
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('p', { class: 'sub', text: 'This protocol records no token in the snapshot. That is the record, not a promise that a token is coming, and farming it costs real gas and carries real risk: only use funds you can afford to leave in the position.' })
    ));
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
  }

  function render() {
    app.textContent = '';
    var shell = el('div', { class: 'shell' });
    shell.appendChild(header());
    shell.appendChild(lede());
    shell.appendChild(tiles());
    shell.appendChild(controls());
    shell.appendChild(state.tab === 'pre-token' ? boardTable() : liveTable());
    if (state.tab === 'pre-token') shell.appendChild(modelPanel());
    shell.appendChild(el('p', { class: 'footnote', text: 'Source: ' + DATA.source + '. Snapshot as of ' + DATA.as_of + '. Implied values are the radar-2 model, computed from the snapshot alone.' }));
    shell.appendChild(el('p', { class: 'footnote', text: 'A protocol "records no token" when the snapshot carries no market cap, CoinGecko id or symbol for it. The board never claims a token will launch.' }));
    app.appendChild(shell);
    app.setAttribute('aria-busy', 'false');
    if (!dialog.isConnected) app.appendChild(dialog);
    if (state.selected) openDetail(state.selected);
  }

  readHash();
  render();
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && dialog.open) dialog.close();
  });
})();
