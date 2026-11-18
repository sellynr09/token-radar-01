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

/** Why a row ranks where it does, from the same figures the model scores: TVL against the
    board median, the base the 0.30 multiple gives, the growth multiplier the week's change
    sets, and the maturity multiplier the age with no token sets. One sentence, all numbers
    the row already carries, so the drawer explains the rank instead of only stating it. */
function whyRank(row, model, medianTvl) {
  var base = row.tvl_usd * model.base_multiple;
  var median = medianTvl || 1;
  var ratio = (row.tvl_usd / median).toFixed(1);
  var growth = (row.change_7d === null || row.change_7d === undefined)
    ? 'with no 7-day change on record, the growth multiplier stays 1.00'
    : 'its ' + fmtPct(row.change_7d) + ' week puts the growth multiplier at ' + row.growth_multiplier;
  var age = (row.age_days === null || row.age_days === undefined)
    ? 'an unknown age counts as ' + model.unknown_age_days + ' days'
    : fmtAge(row.age_days) + ' with no token';
  return 'Rank ' + row.rank + ' because it holds ' + fmtUsd(row.tvl_usd) + ' of TVL, ' + ratio + 'x the board median: the ' + model.base_multiple + ' base alone is ' + fmtUsd(base) + ', ' + growth + ', and ' + age + ' puts the maturity multiplier at ' + row.maturity_multiplier + ' — so the model reads ' + fmtUsd(row.implied_value_usd) + '.';
}

/** A row's confidence, the same rule lib/model.ts writes to board.json: high needs a recorded
    age, a reported 7-day change and a TVL at or above the board median; low is an estimated
    age together with a missing week or a fall past 10%, worse than the board median's -8.2%
    week; everything else is medium. */
function confidenceOf(row, medianTvl) {
  var ageKnown = row.age_days !== null && row.age_days !== undefined;
  var growthKnown = row.change_7d !== null && row.change_7d !== undefined;
  var aboveMedian = row.tvl_usd >= medianTvl;
  if (ageKnown && growthKnown && aboveMedian) return 'high';
  if (!ageKnown && (!growthKnown || row.change_7d < -10)) return 'low';
  return 'medium';
}
function confidenceLabel(conf) { return conf.charAt(0).toUpperCase() + conf.slice(1); }
/** One line on what drove a row's confidence, from the same three facts the rule reads. */
function confidenceWhy(row, medianTvl) {
  var conf = confidenceOf(row, medianTvl);
  var ageKnown = row.age_days !== null && row.age_days !== undefined;
  var growthKnown = row.change_7d !== null && row.change_7d !== undefined;
  var aboveMedian = row.tvl_usd >= medianTvl;
  var bits = [];
  bits.push(ageKnown ? 'its listing age is on record' : 'its listing age is unknown, so the model counts 180 days');
  if (growthKnown && row.change_7d < -10) bits.push('TVL fell ' + Math.abs(row.change_7d).toFixed(1) + '% this week');
  else bits.push(growthKnown ? "the week's change is reported" : 'no 7-day change is on record');
  bits.push(aboveMedian ? 'its TVL sits above the board median' : 'its TVL sits below the board median');
  return 'Confidence is ' + conf + ' because ' + bits.join(', ') + '.';
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
/** One transaction's gas on a chain, by family: mainnet is an order of magnitude above the L2s,
    Solana and BNB Chain sit at the cheap end, and anything unlisted is priced as a cheap chain
    rather than guessed at. The same derivation main.ts writes to board.json. */
var L2_CHAIN = /(arbitrum|optimism|base|zksync|linea|scroll|blast|unichain|mode|ink|fraxtal|starknet|taiko|zora|soneium|abstract|mantle|metis|boba|\bbob\b|kroma|manta|morph|swell|katana|hemi|plume|zkfair|zklink|apex|op_bnb|opbnb|megaeth|rise|fluent|fogo|odyssey|tempo|codex|etherlink|ronin|immutable)/;
function gasProfile(chain) {
  var c = (chain || '').toLowerCase();
  if (chain === 'Ethereum') return { label: 'Ethereum mainnet', figure: '$5 to $20' };
  if (c.indexOf('solana') >= 0) return { label: 'Solana', figure: 'under $0.01' };
  if (c.indexOf('bitcoin') >= 0) return { label: 'Bitcoin', figure: 'a few dollars' };
  if (L2_CHAIN.test(c)) return { label: 'this L2', figure: 'under $0.50' };
  if (c.indexOf('binance') >= 0 || c.indexOf('bnb') >= 0) return { label: 'BNB Chain', figure: 'under $0.50' };
  if (c.indexOf('polygon') >= 0) return { label: 'Polygon', figure: 'a few cents' };
  if (c.indexOf('avalanche') >= 0) return { label: 'Avalanche', figure: 'under $1' };
  if (c.indexOf('tron') >= 0) return { label: 'Tron', figure: 'under $1' };
  return { label: 'this chain', figure: 'under $1' };
}
function gasHint(chain) {
  var g = gasProfile(chain);
  return 'gas on ' + g.label + ' is ' + g.figure + ' a transaction';
}
function gasPerTx(chain) { return gasProfile(chain).figure; }
/** A one-line bridge note for a protocol on more than one chain, or null on a single chain. */
function bridgeHint(chains) {
  if (!chains || chains.length < 2) return null;
  var others = chains.slice(1);
  var shown = others.slice(0, 2).join(', ');
  var rest = others.length - 2;
  var more = rest > 0 ? ' and ' + rest + ' more' : '';
  return 'also runs on ' + shown + more + ', so farm where gas is cheapest';
}
/** The whole plan's effort: setup, weekly actions and claim check at ten minutes an action,
    plus four extra weekly check-ins while the protocol is under 180 days old. */
function timeEstimate(holdDays, ageDays) {
  var weeks = Math.max(1, Math.ceil(holdDays / 7));
  var extraWeeks = (ageDays !== null && ageDays !== undefined && ageDays < 180) ? Math.min(weeks, 4) : 0;
  var minutes = 45 + 10 * (weeks + extraWeeks);
  var hours = Math.round(minutes / 30) / 2;
  return 'about ' + hours + ' hour' + (hours === 1 ? '' : 's') + ' of activity spread over ' + holdDays + ' days';
}
/** A momentum warning for a protocol whose TVL fell this week, or null when it did not: the
    same derivation main.ts writes to board.json. */
function momentumNote(p) {
  if (p.change_7d === null || p.change_7d === undefined || p.change_7d >= 0) return null;
  return ' TVL fell ' + Math.abs(p.change_7d).toFixed(1) + '% this week — size the first position small and re-check before adding.';
}
function farmSteps(p) {
  var chain = chainOf(p);
  var capital = capitalFor(p);
  var hold = holdDaysFor(p.age_days);
  var steps = [
    { text: 'Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.', cost: 'first transaction costs ' + gasPerTx(chain) + ' in gas', time: '5 minutes' },
    { text: actionFor(p, capital, chain), cost: '$' + capital + ' of capital; ' + gasHint(chain), time: '15 minutes to set up' }
  ];
  var bridge = bridgeHint(p.chains);
  if (bridge !== null) {
    steps.push({ text: 'Bridge your USDC to ' + chain + ' once: the protocol ' + bridge, cost: 'one bridge, ' + gasPerTx(chain) + ' in gas', time: '15 minutes' });
  }
  steps.push(
    { text: secondActionFor(p, capital, chain), cost: 'one more transaction: ' + gasHint(chain), time: '10 minutes' },
    { text: 'Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote.', cost: 'each weekly action costs ' + gasPerTx(chain) + ' in gas', time: '10 minutes a week' },
    { text: 'Hold the position for at least ' + hold + ' days so the activity is counted in more than one snapshot.' + (momentumNote(p) || ''), cost: 'the $' + capital + ' stays in the position', time: timeEstimate(hold, p.age_days) },
    { text: "Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes.", cost: 'no fee to check, and never pay to claim', time: '10 minutes' },
    { text: 'Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.', cost: 'nothing but the log', time: '5 minutes' }
  );
  return steps.map(stepText);
}

/** One step's gas in dollars, read from the Cost: tail the drawer already renders:
    "under $X" counts as X, "$X to $Y" as Y, "a few cents" as $0.05, "a few dollars"
    as $3; a step with no gas figure (capital held, no fee to check) counts as $0. */
function gasFigure(cost) {
  var m = /under \$([\d.]+)/.exec(cost);
  if (m) return Number(m[1]);
  m = /\$([\d.]+) to \$([\d.]+)/.exec(cost);
  if (m) return Number(m[2]);
  if (/a few cents/.test(cost)) return 0.05;
  if (/a few dollars/.test(cost)) return 3;
  return 0;
}
function fmtGas(n) { return '$' + (n % 1 === 0 ? String(n) : n.toFixed(2)); }
/** A plan's totals, parsed from its own step strings, so the drawer can summarise the
    plan it already shows. One-off gas is the sum of the steps' gas figures; the weekly
    action is kept apart because it recurs. Time is the hold step's whole-plan effort
    ("about X hours of activity spread over Y days"), which already counts setup, the
    weekly actions and the claim check, so the per-step minutes are not added on top. */
function planTotals(steps) {
  var gas = 0, weeklyGas = 0, hours = null, days = null;
  steps.forEach(function (s) {
    var at = s.indexOf(' Cost: ');
    var rest = at >= 0 ? s.slice(at + 7) : '';
    var tat = rest.indexOf(' Time: ');
    var cost = tat >= 0 ? rest.slice(0, tat) : rest;
    var time = tat >= 0 ? rest.slice(tat + 7).replace(/\.$/, '') : '';
    var g = gasFigure(cost);
    if (/each weekly action/.test(cost)) weeklyGas += g;
    else gas += g;
    var hm = /about ([\d.]+) hours? of activity spread over (\d+) days/.exec(time);
    if (hm) { hours = Number(hm[1]); days = Number(hm[2]); }
  });
  return { gas: gas, weeklyGas: weeklyGas, hours: hours, days: days };
}
function planTotalText(steps) {
  var t = planTotals(steps);
  var out = 'Plan total: about ' + fmtGas(t.gas) + ' in gas';
  if (t.hours !== null) out += ' · about ' + t.hours + ' hour' + (t.hours === 1 ? '' : 's') + ' of activity' + (t.days !== null ? ' over ' + t.days + ' days' : '');
  if (t.weeklyGas > 0) out += ' · then ' + fmtGas(t.weeklyGas) + ' per weekly action';
  return out + '.';
}

(function () {
  'use strict';
  var DATA = (typeof window !== 'undefined' && window.RADAR) || null;
  if (!DATA || typeof document === 'undefined') return;
  var app = document.getElementById('board');
  if (!app) return;
  var state = { q: '', category: 'all', chain: 'all', minTvl: 0, confidence: 'all', tab: 'pre-token', sort: 'implied', dir: -1, selected: null, kbIndex: -1, compare: [], catOv: null };

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
    if (params.get('conf')) state.confidence = params.get('conf');
    if (params.get('cmp')) state.compare = params.get('cmp').split(',').slice(0, 2);
    if (params.get('catov')) state.catOv = params.get('catov');
    if (params.get('tab')) state.tab = params.get('tab');
    if (params.get('p')) state.selected = params.get('p');
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.chain !== 'all') params.set('chain', state.chain);
    if (state.minTvl) params.set('mintvl', String(state.minTvl));
    if (state.confidence !== 'all') params.set('conf', state.confidence);
    if (state.compare.length) params.set('cmp', state.compare.join(','));
    if (state.catOv) params.set('catov', state.catOv);
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
      if (state.confidence !== 'all' && confidenceOf(r, DATA.median_tvl_usd) !== state.confidence) return false;
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
      else if (key === 'confidence') { var confRank = { high: 3, medium: 2, low: 1 }; av = confRank[confidenceOf(a, DATA.median_tvl_usd)] || 0; bv = confRank[confidenceOf(b, DATA.median_tvl_usd)] || 0; }
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
    var confCounts = { high: 0, medium: 0, low: 0 };
    DATA.rows.forEach(function (r) { confCounts[confidenceOf(r, DATA.median_tvl_usd)] += 1; });
    var confOptions = [['all', 'All confidence'], ['high', 'High (' + confCounts.high + ')'], ['medium', 'Medium (' + confCounts.medium + ')'], ['low', 'Low (' + confCounts.low + ')']];
    var conf = el('select', { id: 'confidence', 'aria-label': 'Filter by confidence' },
      confOptions.map(function (o) { return el('option', { value: o[0], text: o[1], selected: o[0] === state.confidence ? 'selected' : null }); })
    );
    conf.addEventListener('change', function () { state.confidence = conf.value; writeHash(); render(); });
    var pre = el('button', { type: 'button', 'aria-pressed': state.tab === 'pre-token' ? 'true' : 'false', text: 'Pre-token', onclick: function () { state.tab = 'pre-token'; render(); } });
    var live = el('button', { type: 'button', 'aria-pressed': state.tab === 'live' ? 'true' : 'false', text: 'Live token', onclick: function () { state.tab = 'live'; render(); } });
    return el('div', { class: 'controls' },
      el('div', { class: 'field' }, el('label', { for: 'q', text: 'Search' }), search),
      el('div', { class: 'field' }, el('label', { for: 'category', text: 'Category' }), cat),
      el('div', { class: 'field' }, el('label', { for: 'chain', text: 'Chain' }), chain),
      el('div', { class: 'field' }, el('label', { for: 'mintvl', text: 'Minimum TVL' }), mintvl),
      el('div', { class: 'field' }, el('label', { for: 'confidence', text: 'Confidence' }), conf),
      el('div', { class: 'field' }, el('span', { class: 'sub', text: 'Token status' }), el('div', { class: 'tabs' }, pre, live)),
      el('span', { class: 'count', text: state.tab === 'pre-token' ? rows().length + ' rows shown' : DATA.live.length + ' live-token protocols' }),
      state.category !== 'all' ? el('button', { class: 'button', type: 'button', text: 'Category overview', onclick: function () { openCatOv(state.category); } }) : null
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
    if (state.kbIndex >= list.length) state.kbIndex = -1;
    if (list.length === 0) {
      return el('div', { class: 'panel' }, el('div', { class: 'empty' },
        el('h2', { text: 'No protocol matches that filter' }),
        el('p', { text: 'Clear the search or pick another category to see the board again.' }),
        el('button', { class: 'button primary', type: 'button', text: 'Clear filters', onclick: function () { state.q = ''; state.category = 'all'; state.chain = 'all'; state.minTvl = 0; state.confidence = 'all'; writeHash(); render(); } })
      ));
    }
    var max = DATA.top_implied_usd || 1;
    var tbody = el('tbody');
    list.forEach(function (r, i) {
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
        el('td', null, el('span', { class: r.watchlist ? 'badge watch' : 'badge', text: r.watchlist ? 'Watchlist' : 'Early' })),
        el('td', null, el('span', { class: 'badge conf-' + confidenceOf(r, DATA.median_tvl_usd), text: confidenceLabel(confidenceOf(r, DATA.median_tvl_usd)) })),
        el('td', { class: 'cmp', onclick: function (e) { e.stopPropagation(); } },
          el('input', { type: 'checkbox', 'aria-label': 'Compare ' + r.name, checked: state.compare.indexOf(r.slug) >= 0 ? 'checked' : null, onchange: function () { toggleCompare(r.slug); } })
        )
      );
      if (state.kbIndex === i) tr.classList.add('kb-selected');
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
            el('th', { scope: 'col', text: 'List' }),
            sortHeader('confidence', 'Confidence'),
            el('th', { scope: 'col', text: 'Compare' })
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

  /** The best in each category: the top-ranked protocol of every category on the board, one
      chip each, in a single scrolling strip above the table. Select a chip to open that
      protocol's model and farm plan. The strip reads the whole board, not the filters, so it
      stays a map of the board while the table narrows. */
  function bestStrip() {
    var byCat = {};
    DATA.rows.forEach(function (r) {
      var cat = r.category || 'Other';
      if (!byCat[cat] || r.rank < byCat[cat].rank) byCat[cat] = r;
    });
    var cats = Object.keys(byCat).sort();
    return el('section', { class: 'panel best', 'aria-label': 'Best in each category' },
      el('span', { class: 'best-label', text: 'Best in each category' }),
      el('div', { class: 'best-list' }, cats.map(function (c) {
        var r = byCat[c];
        return el('span', { class: 'best-item' },
          el('button', { type: 'button', class: 'best-cat', text: c, onclick: function () { openCatOv(c); } }),
          el('button', { type: 'button', class: 'best-open', onclick: function () { openDetail(r.slug); } },
            el('b', { text: r.name }),
            el('span', { class: 'num', text: '#' + r.rank + ' · ' + fmtUsd(r.implied_value_usd) })
          )
        );
      }))
    );
  }

  /** How the model works, in plain words and with the board's own numbers: the formula
      the model panel below spells out, the confidence rule, and what the board covers.
      Every figure here is computed from the loaded data when the page renders, so the
      panel stays true if the snapshot changes. */
  function methodPanel() {
    var m = DATA.model;
    var confCounts = { high: 0, medium: 0, low: 0 };
    DATA.rows.forEach(function (r) { confCounts[confidenceOf(r, DATA.median_tvl_usd)] += 1; });
    var watchlistPresent = DATA.rows.filter(function (r) { return r.watchlist; }).length;
    var categories = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).length;
    return el('section', { class: 'panel method', 'aria-label': 'How the model works' },
      el('h2', { text: 'How the model works' }),
      el('p', null,
        'Implied value starts from TVL: a token is worth ', el('b', { text: m.base_multiple + 'x' }), ' the value already locked in the protocol. ',
        'The week\'s growth then moves it — ', el('b', { text: 'x' + m.growth_weight }), ' weight, clamped between ', el('b', { text: m.growth_floor + '%' }), ' and ', el('b', { text: '+' + m.growth_cap + '%' }), ' — ',
        'and age with no token adds maturity: ', el('b', { text: m.maturity_floor + ' + up to ' + m.maturity_range }), ' over ', el('b', { text: m.maturity_days + ' days' }), ', ',
        'with an unknown age counted as ', el('b', { text: m.unknown_age_days + ' days' }), '. ',
        'The median row holds ', el('b', { text: fmtUsd(DATA.median_tvl_usd) }), ' of TVL and ', el('b', { text: fmtPct(DATA.median_change_7d) }), ' over seven days, so a protocol still growing stands out.'
      ),
      el('p', null,
        'Confidence is a check on the record behind the rank: ', el('b', { text: 'high' }), ' needs a recorded listing age, a reported week and TVL at or above the median; ',
        el('b', { text: 'low' }), ' is an estimated age together with a missing week or a fall past 10%; the rest is ', el('b', { text: 'medium' }), '. ',
        'On this board that is ', el('b', { text: confCounts.high + ' high' }), ' · ', el('b', { text: confCounts.medium + ' medium' }), ' · ', el('b', { text: confCounts.low + ' low' }), '.'
      ),
      el('p', null,
        'Coverage: ', el('b', { text: watchlistPresent + ' of ' + DATA.watchlist_size + ' watchlist protocols' }), ' are on the board — all of them — ',
        'across ', el('b', { text: DATA.board_size + ' ranked rows' }), ' in ', el('b', { text: categories + ' categories' }), '. ',
        'A protocol "records no token" when the snapshot carries none for it, not that it has none, and implied value is an estimate, never a price.'
      )
    );
  }

  /** Compare, by slug: two protocols side by side, with a verdict the model implies.
      Selection lives in state, so it survives filtering; a third check replaces the oldest. */
  function rowBySlug(slug) {
    return DATA.rows.filter(function (r) { return r.slug === slug; })[0];
  }
  function toggleCompare(slug) {
    var i = state.compare.indexOf(slug);
    if (i >= 0) state.compare.splice(i, 1);
    else { if (state.compare.length >= 2) state.compare.shift(); state.compare.push(slug); }
    writeHash(); render();
  }
  function compareVerdict(a, b) {
    var hi = a.implied_value_usd >= b.implied_value_usd ? a : b;
    var lo = hi === a ? b : a;
    var out = hi.name + ' #' + hi.rank + ' beats ' + lo.name + ' #' + lo.rank + ': ' + fmtUsd(hi.tvl_usd) + ' of TVL, ' + (hi.tvl_usd / Math.max(1, lo.tvl_usd)).toFixed(1) + 'x the other';
    if (hi.change_7d !== null && lo.change_7d !== null && hi.change_7d !== lo.change_7d) out += ', and it ' + (hi.change_7d > lo.change_7d ? 'grew faster this week' : 'still ranks higher') + ' (' + fmtPct(hi.change_7d) + ' vs ' + fmtPct(lo.change_7d) + ')';
    return out + ' — so the model reads ' + fmtUsd(hi.implied_value_usd) + ' against ' + fmtUsd(lo.implied_value_usd) + '.';
  }
  function comparePanel() {
    if (state.compare.length === 0) return null;
    var picked = state.compare.map(rowBySlug).filter(function (r) { return r; });
    if (picked.length === 0) return null;
    var names = picked.map(function (r) { return r.name; }).join(' vs ');
    var head = el('div', { class: 'compare-head' },
      el('h2', { text: picked.length === 2 ? 'Compare: ' + names : 'Compare: ' + names + ' — pick one more' }),
      el('button', { class: 'button', type: 'button', text: 'Clear', onclick: function () { state.compare = []; writeHash(); render(); } })
    );
    if (picked.length < 2) return el('section', { class: 'panel compare' }, head);
    var a = picked[0], b = picked[1];
    function planCell(r) {
      var t = planTotals(farmSteps(r));
      return 'about ' + fmtGas(t.gas) + ' gas · ' + (t.hours === null ? 'n/a' : t.hours + 'h over ' + t.days + 'd');
    }
    function metric(label, fa, fb) {
      return el('tr', null, el('th', { scope: 'row', text: label }), el('td', { class: 'num', text: fa }), el('td', { class: 'num', text: fb }));
    }
    return el('section', { class: 'panel compare', 'aria-label': 'Compare protocols' }, head,
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Metric' }), el('th', { scope: 'col', text: a.name }), el('th', { scope: 'col', text: b.name }))),
          el('tbody', null,
            metric('Rank', '#' + a.rank, '#' + b.rank),
            metric('TVL', fmtUsd(a.tvl_usd), fmtUsd(b.tvl_usd)),
            metric('7-day growth', fmtPct(a.change_7d), fmtPct(b.change_7d)),
            metric('Age, no token', fmtAge(a.age_days), fmtAge(b.age_days)),
            metric('Implied value', fmtUsd(a.implied_value_usd), fmtUsd(b.implied_value_usd)),
            metric('Confidence', confidenceLabel(confidenceOf(a, DATA.median_tvl_usd)), confidenceLabel(confidenceOf(b, DATA.median_tvl_usd))),
            metric('Plan total', planCell(a), planCell(b))
          )
        )
      ),
      el('p', { class: 'sub verdict', text: compareVerdict(a, b) })
    );
  }

  /** A category at a glance, from the board alone. */
  function catStats(cat) {
    var list = DATA.rows.filter(function (r) { return (r.category || 'Other') === cat; });
    var tvls = list.map(function (r) { return r.tvl_usd; }).sort(function (x, y) { return x - y; });
    var top = list.slice().sort(function (x, y) { return x.rank - y.rank; })[0];
    var total = list.reduce(function (n, r) { return n + r.implied_value_usd; }, 0);
    return { count: list.length, median: tvls.length ? tvls[Math.floor(tvls.length / 2)] : 0, top: top, total: total };
  }
  function openCatOv(cat) { state.catOv = cat; writeHash(); render(); }
  function catOvPanel() {
    if (!state.catOv) return null;
    var s = catStats(state.catOv);
    if (!s.top) return null;
    return el('section', { class: 'panel catov', 'aria-label': 'Category overview' },
      el('div', { class: 'compare-head' },
        el('h2', { text: 'Category: ' + state.catOv }),
        el('button', { class: 'button', type: 'button', text: 'Close', onclick: function () { state.catOv = null; writeHash(); render(); } })
      ),
      el('div', { class: 'tiles' },
        tile('Protocols', String(s.count), ''),
        tile('Median TVL', fmtUsd(s.median), ''),
        tile('Top pick', s.top.name, '#' + s.top.rank + ' · ' + fmtUsd(s.top.implied_value_usd)),
        tile('Total implied', fmtUsd(s.total), '')
      ),
      el('p', { class: 'sub', text: 'Top pick by rank; the total sums the category — an estimate, not a price.' }),
      el('button', { class: 'button primary', type: 'button', text: 'Show only this category', onclick: function () { state.category = state.catOv; state.catOv = null; writeHash(); render(); } })
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
        el('div', { class: 'model-cell' }, el('b', { text: 'Growth moves ranks' }), el('span', { text: 'The median protocol changed ' + fmtPct(DATA.median_change_7d) + ' of TVL in the week, so one still growing stands out; a single hot week cannot buy the top.' })),
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
      el('h3', { text: 'Why this rank' }),
      el('p', { class: 'sub', text: whyRank(row, DATA.model, DATA.median_tvl_usd) })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Confidence' }),
      el('p', { class: 'sub' },
        el('span', { class: 'badge conf-' + confidenceOf(row, DATA.median_tvl_usd), text: confidenceLabel(confidenceOf(row, DATA.median_tvl_usd)) }),
        ' ' + confidenceWhy(row, DATA.median_tvl_usd)
      )
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Farm plan' }),
      el('p', { class: 'plan-total', text: planTotalText(steps) }),
      el('ol', { class: 'steps' }, steps.map(function (s) {
        var at = s.indexOf(' Cost: ');
        var action = at >= 0 ? s.slice(0, at) : s;
        var rest = at >= 0 ? s.slice(at + 7) : '';
        var tat = rest.indexOf(' Time: ');
        var cost = tat >= 0 ? rest.slice(0, tat) : rest;
        var time = tat >= 0 ? rest.slice(tat + 7) : '';
        if (time.charAt(time.length - 1) === '.') time = time.slice(0, -1);
        return el('li', null, el('b', { text: action }), el('span', { class: 'cost', text: 'Cost: ' + cost }), el('span', { class: 'time', text: 'Time: ' + time }));
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
    if (state.tab === 'pre-token') shell.appendChild(bestStrip());
    if (state.tab === 'pre-token') shell.appendChild(methodPanel());
    if (state.tab === 'pre-token') {
      var cp = comparePanel(), co = catOvPanel();
      if (cp) shell.appendChild(cp);
      if (co) shell.appendChild(co);
    }
    shell.appendChild(state.tab === 'pre-token' ? boardTable() : liveTable());
    if (state.tab === 'pre-token') shell.appendChild(modelPanel());
    shell.appendChild(el('p', { class: 'footnote', text: 'Source: ' + DATA.source + '. Snapshot as of ' + DATA.as_of + '. Implied values are the radar-2 model, computed from the snapshot alone.' }));
    shell.appendChild(el('p', { class: 'footnote', text: 'A protocol "records no token" when the snapshot carries no market cap, CoinGecko id or symbol for it. The board never claims a token will launch.' }));
    app.appendChild(shell);
    app.setAttribute('aria-busy', 'false');
    if (!dialog.isConnected) app.appendChild(dialog);
    if (state.selected) openDetail(state.selected);
  }

  // Keyboard navigation for the board. ArrowDown and ArrowUp walk the rows the current filters
  // leave visible, Enter opens the walked-to row, and "/" puts the cursor in the search box.
  // The walk is a class on one row at a time, so the first paint never shows it, and the walk
  // never touches the data: it only reads the same filtered, sorted list the table renders.
  // Keys are ignored while typing in a field or while the detail drawer is open, so the walk
  // never steals a keystroke the search box or the drawer needs.
  function visibleRows() {
    if (state.tab !== 'pre-token') return [];
    return sortedRows(rows());
  }
  function paintSelection() {
    var trs = app.querySelectorAll('.table-wrap tbody tr');
    for (var i = 0; i < trs.length; i++) {
      trs[i].classList.toggle('kb-selected', i === state.kbIndex);
    }
    var current = trs[state.kbIndex];
    if (current && typeof current.scrollIntoView === 'function') current.scrollIntoView({ block: 'nearest' });
  }
  function stepSelection(step) {
    var list = visibleRows();
    if (list.length === 0) return;
    if (state.kbIndex < 0) state.kbIndex = step > 0 ? 0 : list.length - 1;
    else state.kbIndex = Math.min(list.length - 1, Math.max(0, state.kbIndex + step));
    paintSelection();
  }
  function openSelected() {
    var list = visibleRows();
    var row = list[state.kbIndex];
    if (row) openDetail(row.slug);
  }
  function typingIn(e) {
    var tag = e.target && e.target.tagName;
    return tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || (e.target && e.target.isContentEditable);
  }

  readHash();
  render();
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && dialog.open) dialog.close();
    if (typingIn(e) || dialog.open) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); stepSelection(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); stepSelection(-1); }
    else if (e.key === 'Enter' && state.kbIndex >= 0 && e.target === document.body) { e.preventDefault(); openSelected(); }
    else if (e.key === '/') {
      var search = document.getElementById('q');
      if (search) { e.preventDefault(); search.focus(); search.select(); }
    }
  });
})();
