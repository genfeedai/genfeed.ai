(() => {
  const D = window.__LOADTEST__;
  const SCALES = D.scales;
  const MAX = String(SCALES[SCALES.length - 1]);
  const HAS_AFTER = D.rows.some((r) =>
    Object.values(r.cells).some((c) => c.after?.summary),
  );
  const BUDGET = {
    interactive: { warn: 100, fail: 500 },
    sweep: { warn: 250, fail: 2000 },
  };
  const budgetOf = (g) => (g === 'sweep' ? BUDGET.sweep : BUDGET.interactive);
  const state = { kind: 'whale', group: 'all', open: new Set() };
  const $ = (sel, root) => (root || document).querySelector(sel);
  const el = (tag, attrs, html) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) n.setAttribute(k, v);
    if (html != null) n.innerHTML = html;
    return n;
  };
  const esc = (s) =>
    String(s).replace(
      /[&<>"]/g,
      (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c],
    );
  const fmt = (ms) => {
    if (ms == null || Number.isNaN(ms)) return '–';
    if (ms >= 1000) return `${(ms / 1000).toFixed(ms >= 10000 ? 1 : 2)} s`;
    if (ms >= 100) return `${ms.toFixed(0)} ms`;
    if (ms >= 10) return `${ms.toFixed(1)} ms`;
    return `${ms.toFixed(2)} ms`;
  };
  const med = (s) => (s?.summary ? s.summary.median : null);

  function statusOf(side, group) {
    if (!side) return 'na';
    if (side.errors > 0) return 'fail';
    const m = med(side);
    if (m == null) return 'na';
    const b = budgetOf(group);
    return m >= b.fail ? 'fail' : m >= b.warn ? 'warn' : 'ok';
  }
  const ICON = { fail: '✕', warn: '!', ok: '✓', na: '–' };
  const LABEL = { fail: 'FAIL', warn: 'SLOW', ok: 'OK', na: 'n/a' };
  const pill = (st) =>
    `<span class="pill ${st}"><span aria-hidden="true">${ICON[st]}</span>${LABEL[st]}</span>`;

  function growth(row, label) {
    const pts = SCALES.map((s) => [Math.log(s), med(row.cells[s]?.[label])])
      .filter((p) => p[1] > 0)
      .map((p) => [p[0], Math.log(p[1])]);
    if (pts.length < 3) return null;
    const n = pts.length,
      sx = pts.reduce((a, p) => a + p[0], 0),
      sy = pts.reduce((a, p) => a + p[1], 0);
    const sxx = pts.reduce((a, p) => a + p[0] * p[0], 0),
      sxy = pts.reduce((a, p) => a + p[0] * p[1], 0);
    return (n * sxy - sx * sy) / (n * sxx - sx * sx);
  }

  const visible = (kind) =>
    D.rows.filter((r) => r.kind === kind || r.kind === 'global');
  const maxRows = () => D.rows.filter((r) => r.kind !== 'typical');

  // ───────────────────────── header + tiles ─────────────────────────
  function header() {
    const b = D.source.before,
      a = D.source.after;
    const w = el('section');
    const host = D.host || {};
    w.innerHTML = `
      <h1>Database load report</h1>
      <p class="sub">Real queries from the Genfeed API and workers, run against a PostgreSQL schema grown ${SCALES.map((s) => `${s}×`).join(', ')}. “Whale” is one organisation whose data grew with the scale; “typical” is a random ordinary tenant in a database ${SCALES[SCALES.length - 1]}× larger.</p>
      <div class="meta">
        <span>${esc((D.db[MAX]?.version || '').split(' on ')[0])}</span>
        <span>${esc(host.cpus || '?')} vCPU · ${esc(host.memGb || '?')} GB · ${esc(host.node || '')}</span>
        <span>${D.config ? `${D.config.samples} samples × ${D.config.rounds} rounds, ${D.config.warmup} warm-up` : ''}</span>
        ${b ? `<span>before ${esc(b.commit)}</span>` : ''}${a ? `<span>after ${esc(a.commit)}</span>` : ''}
        <span>${SCALES.map((s) => `${s}× = ${D.db[s] ? D.db[s].size : '?'}`).join(' · ')}</span>
      </div>`;
    return w;
  }

  function tiles() {
    const rows = maxRows();
    const over = (label) =>
      rows.filter((r) => {
        const st = statusOf(r.cells[MAX]?.[label], r.group);
        return st === 'fail' || st === 'warn';
      }).length;
    const failing = (label) =>
      rows.filter((r) => statusOf(r.cells[MAX]?.[label], r.group) === 'fail')
        .length;
    const cmps = rows.map((r) => r.cells[MAX]?.cmp).filter(Boolean);
    const wins = cmps.filter((c) => c.significant && c.speedup > 1);
    const losses = cmps.filter((c) => c.significant && c.speedup < 1);
    const geo = wins.length
      ? Math.exp(
          wins.reduce((a, c) => a + Math.log(c.speedup), 0) / wins.length,
        )
      : null;
    const slowest = rows
      .filter((r) => med(r.cells[MAX]?.before) != null)
      .sort((a, b) => med(b.cells[MAX].before) - med(a.cells[MAX].before))[0];
    const t = (k, v, d) =>
      `<div class="tile"><div class="k">${k}</div><div class="v">${v}</div><div class="d">${d}</div></div>`;
    const w = el('section', { class: 'tiles' });
    const total = rows.length;
    w.innerHTML = [
      t(
        `Over budget at ${MAX}×`,
        `${over('before')}<small> / ${total}</small>${HAS_AFTER ? ` <small>→</small> ${over('after')}<small> / ${total}</small>` : ''}`,
        `Queries at or past the slow line (${BUDGET.interactive.warn} ms interactive, ${BUDGET.sweep.warn} ms sweeps). ${failing('before')} fail outright before${HAS_AFTER ? `, ${failing('after')} after` : ''}.`,
      ),
      HAS_AFTER
        ? t(
            'Median speed-up',
            geo ? `${geo.toFixed(1)}×` : '–',
            `Geometric mean over the ${wins.length} queries that got significantly faster at ${MAX}× (Holm-adjusted p < 0.01, speed-up CI excludes 1).`,
          )
        : t(
            `Slowest at ${MAX}×`,
            slowest ? fmt(med(slowest.cells[MAX].before)) : '–',
            slowest ? `<code>${esc(slowest.id)}</code> (${slowest.kind})` : '',
          ),
      HAS_AFTER
        ? t(
            'Regressions',
            String(losses.length),
            losses.length
              ? 'Significantly slower after the change. See the table.'
              : 'No query is significantly slower after the change.',
          )
        : t(
            'Fastest-growing',
            fastest(),
            'Median latency growth per ×10 of data (log-log slope); 1.0 is linear.',
          ),
      t(`Rows at ${MAX}×`, rowsAtMax(), `Largest tables: ${largest()}`),
    ].join('');
    return w;
  }
  function fastest() {
    const g = D.rows
      .map((r) => ({ r, g: growth(r, 'before') }))
      .filter((x) => x.g != null)
      .sort((a, b) => b.g - a.g)[0];
    return g ? `${g.g.toFixed(2)}<small> ${esc(g.r.id)}</small>` : '–';
  }
  function rowsAtMax() {
    const rc = D.db[MAX]?.rowCounts || [];
    const n = rc.reduce((a, x) => a + x.n, 0);
    return n >= 1e6
      ? `${(n / 1e6).toFixed(1)}M`
      : n >= 1e3
        ? `${(n / 1e3).toFixed(0)}k`
        : String(n);
  }
  function largest() {
    const rc = (D.db[MAX]?.rowCounts || [])
      .slice()
      .sort((a, b) => b.n - a.n)
      .slice(0, 3);
    return rc
      .map(
        (x) =>
          x.relname +
          ' ' +
          (x.n >= 1e6
            ? `${(x.n / 1e6).toFixed(2)}M`
            : `${(x.n / 1e3).toFixed(0)}k`),
      )
      .join(', ');
  }

  // ───────────────────────── scaling panels ─────────────────────────
  function panelSvg(row) {
    const W = 250,
      H = 150,
      x0 = 38,
      x1 = 238,
      y0 = 8,
      y1 = 118;
    const vals = [];
    for (const s of SCALES) {
      for (const l of ['before', 'after']) {
        const sd = row.cells[s]?.[l];
        if (sd?.summary) {
          vals.push(
            sd.summary.medianCi.low,
            sd.summary.medianCi.high,
            sd.summary.median,
          );
        }
      }
    }
    if (!vals.length)
      return '<svg viewBox="0 0 250 40"><text x="4" y="22">no samples</text></svg>';
    const b = budgetOf(row.group);
    const lo =
      10 ** Math.floor(Math.log10(Math.max(0.1, Math.min(...vals))) - 0.0);
    const hi = 10 ** Math.ceil(Math.log10(Math.max(...vals, b.warn * 1.2)));
    const ly = (v) =>
      y1 -
      ((Math.log10(Math.max(v, lo)) - Math.log10(lo)) /
        (Math.log10(hi) - Math.log10(lo))) *
        (y1 - y0);
    const lx = (i) => x0 + (i * (x1 - x0)) / (SCALES.length - 1);
    let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(row.id)} latency by scale">`;
    for (let d = Math.log10(lo); d <= Math.log10(hi) + 1e-9; d++) {
      const v = 10 ** d;
      s += `<line class="grid" x1="${x0}" x2="${x1}" y1="${ly(v)}" y2="${ly(v)}"/><text x="${x0 - 5}" y="${ly(v) + 3.5}" text-anchor="end">${v >= 1000 ? `${v / 1000}s` : `${v}ms`}</text>`;
    }
    if (b.fail <= hi)
      s += `<line class="budget" x1="${x0}" x2="${x1}" y1="${ly(b.fail)}" y2="${ly(b.fail)}"/><text x="${x1}" y="${ly(b.fail) - 3}" text-anchor="end">fail</text>`;
    SCALES.forEach((sc, i) => {
      s += `<text x="${lx(i)}" y="${y1 + 16}" text-anchor="middle">${sc}×</text>`;
    });
    ['before', 'after'].forEach((l) => {
      const pts = SCALES.map((sc, i) => {
        const sd = row.cells[sc]?.[l];
        return sd?.summary ? { i, sd } : null;
      }).filter(Boolean);
      if (!pts.length) return;
      s += `<polyline class="l-${l}" points="${pts.map((p) => `${lx(p.i)},${ly(p.sd.summary.median)}`).join(' ')}"/>`;
      pts.forEach((p) => {
        const ci = p.sd.summary.medianCi;
        s += `<line class="ci-${l}" x1="${lx(p.i)}" x2="${lx(p.i)}" y1="${ly(ci.low)}" y2="${ly(ci.high)}"/>`;
        s += `<circle class="p-${l}" cx="${lx(p.i)}" cy="${ly(p.sd.summary.median)}" r="4"/>`;
        if (p.sd.errors > 0)
          s += `<text x="${lx(p.i)}" y="${ly(p.sd.summary.median) - 8}" text-anchor="middle" style="fill:var(--crit-ink)">✕</text>`;
      });
    });
    SCALES.forEach((sc, i) => {
      s += `<rect class="hit" data-scale="${sc}" x="${lx(i) - 22}" y="${y0 - 4}" width="44" height="${y1 - y0 + 24}"/>`;
    });
    return `${s}</svg>`;
  }

  function tipHtml(row, sc) {
    const c = row.cells[sc] || {};
    const line = (l, sd) =>
      sd?.summary
        ? `${l} ${fmt(sd.summary.median)} (95% CI ${fmt(sd.summary.medianCi.low)}–${fmt(sd.summary.medianCi.high)}) · p95 ${fmt(sd.summary.p95)} · n=${sd.summary.n}${sd.errors ? ` · ${sd.errors} errors` : ''}`
        : `${l} no samples${sd?.firstError ? `: ${esc(sd.firstError.slice(0, 80))}` : ''}`;
    let h = `<b>${esc(row.id)}</b> at ${sc}×<br>${line('before', c.before)}`;
    if (c.after) h += `<br>${line('after ', c.after)}`;
    if (c.cmp)
      h += `<br>${c.cmp.speedup.toFixed(2)}× (CI ${c.cmp.speedupCi.low.toFixed(2)}–${c.cmp.speedupCi.high.toFixed(2)}), adj. p=${c.cmp.adjustedP < 0.0001 ? '<0.0001' : c.cmp.adjustedP.toFixed(4)}${c.cmp.significant ? '' : ' (not significant)'}`;
    const sd = c.after || c.before;
    if (sd)
      h += `<br>${sd.statementsPerCall} SQL statement${sd.statementsPerCall === 1 ? '' : 's'} per call`;
    return h;
  }

  function panels() {
    const sec = el('section');
    sec.innerHTML = `
      <div class="section-head">
        <div><h2>Latency as the data grows</h2><p>Median per call on a log scale, with the 95% bootstrap interval of the median. Dashed line: the fail budget (${BUDGET.interactive.fail} ms interactive, ${BUDGET.sweep.fail / 1000} s sweeps).</p></div>
        <div class="controls">
          <div class="seg" id="seg-kind" role="group" aria-label="Tenant"></div>
          <div class="seg" id="seg-group" role="group" aria-label="Group"></div>
        </div>
      </div>
      <div class="legend" style="margin-bottom:10px"><span><i style="border-color:var(--before)"></i>before</span>${HAS_AFTER ? '<span><i style="border-color:var(--after)"></i>after</span>' : ''}<span><i class="dash"></i>fail budget</span></div>
      <div class="panels" id="panels"></div>`;
    const kinds = [
      ['whale', 'Whale tenant'],
      ['typical', 'Typical tenant'],
    ];
    const groups = [
      ['all', 'All'],
      ['list', 'Lists'],
      ['auth', 'Auth'],
      ['detail', 'Detail'],
      ['analytics', 'Analytics'],
      ['sweep', 'Sweeps'],
    ];
    const draw = () => {
      $('#seg-kind', sec).innerHTML = kinds
        .map(
          ([k, l]) =>
            `<button type="button" data-k="${k}" aria-pressed="${state.kind === k}">${l}</button>`,
        )
        .join('');
      $('#seg-group', sec).innerHTML = groups
        .map(
          ([k, l]) =>
            `<button type="button" data-g="${k}" aria-pressed="${state.group === k}">${l}</button>`,
        )
        .join('');
      const list = visible(state.kind).filter(
        (r) => state.group === 'all' || r.group === state.group,
      );
      $('#panels', sec).innerHTML = '';
      list.forEach((row) => {
        const last = row.cells[MAX] || {};
        const st = statusOf(last.after || last.before, row.group);
        const p = el('article', { class: 'panel' });
        p.innerHTML = `<header><span class="id">${esc(row.id)}</span>${pill(st)}</header><div class="desc">${esc(row.description)}</div>${panelSvg(row)}`;
        p.querySelectorAll('.hit').forEach((h) => {
          h.addEventListener('pointermove', (e) =>
            showTip(e, tipHtml(row, h.getAttribute('data-scale'))),
          );
          h.addEventListener('pointerleave', hideTip);
        });
        $('#panels', sec).appendChild(p);
      });
      if (!list.length)
        $('#panels', sec).innerHTML =
          '<p class="sub">No queries in this view.</p>';
    };
    sec.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.k) state.kind = b.dataset.k;
      if (b.dataset.g) state.group = b.dataset.g;
      draw();
    });
    draw();
    return sec;
  }

  // ───────────────────────── before / after at max ─────────────────────────
  function dumbbell() {
    const rows = maxRows()
      .filter((r) => med(r.cells[MAX]?.before) != null)
      .sort((a, b) => med(b.cells[MAX].before) - med(a.cells[MAX].before));
    const sec = el('section');
    sec.innerHTML = `<div class="section-head"><div><h2>At ${MAX}×: before${HAS_AFTER ? ' and after' : ''}</h2><p>Median latency per call for every whale and cross-tenant query, slowest first. Log scale; whiskers are the 95% interval of the median.</p></div>
      <div class="legend"><span><i style="border-color:var(--before)"></i>before</span>${HAS_AFTER ? '<span><i style="border-color:var(--after)"></i>after</span>' : ''}<span><i class="dash"></i>fail budget</span></div></div><div class="card" id="db"></div>`;
    const W = 1000,
      LBL = 250,
      RH = 24,
      T = 26,
      H = T + rows.length * RH + 10,
      x0 = LBL,
      x1 = W - 20;
    const all = [];
    for (const r of rows) {
      for (const l of ['before', 'after']) {
        const sd = r.cells[MAX][l];
        if (sd?.summary)
          all.push(sd.summary.medianCi.low, sd.summary.medianCi.high);
      }
    }
    const lo = 10 ** Math.floor(Math.log10(Math.max(0.1, Math.min(...all)))),
      hi = 10 ** Math.ceil(Math.log10(Math.max(...all, 2000)));
    const lx = (v) =>
      x0 +
      ((Math.log10(Math.max(v, lo)) - Math.log10(lo)) /
        (Math.log10(hi) - Math.log10(lo))) *
        (x1 - x0);
    let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Before and after latency at ${MAX}x">`;
    for (let d = Math.log10(lo); d <= Math.log10(hi) + 1e-9; d++) {
      const v = 10 ** d;
      s += `<line class="grid" x1="${lx(v)}" x2="${lx(v)}" y1="${T - 8}" y2="${H - 10}"/><text x="${lx(v)}" y="${T - 12}" text-anchor="middle">${v >= 1000 ? `${v / 1000} s` : `${v} ms`}</text>`;
    }
    [BUDGET.interactive.fail, BUDGET.sweep.fail]
      .filter((v, i, a) => a.indexOf(v) === i)
      .forEach((v) => {
        s += `<line class="budget" x1="${lx(v)}" x2="${lx(v)}" y1="${T - 8}" y2="${H - 10}"/>`;
      });
    rows.forEach((r, i) => {
      const y = T + i * RH + RH / 2,
        c = r.cells[MAX];
      s += `<text x="${LBL - 10}" y="${y + 3.5}" text-anchor="end" style="fill:var(--ink)">${esc(r.id)}${r.kind === 'global' ? '' : ' ·w'}</text>`;
      const b = c.before?.summary,
        a = c.after?.summary;
      if (b && a)
        s += `<line x1="${lx(b.median)}" x2="${lx(a.median)}" y1="${y}" y2="${y}" stroke="var(--ink-3)" stroke-width="1.5" opacity=".6"/>`;
      [
        ['before', b],
        ['after', a],
      ].forEach(([l, sm]) => {
        if (!sm) return;
        s += `<line class="ci-${l}" x1="${lx(sm.medianCi.low)}" x2="${lx(sm.medianCi.high)}" y1="${y}" y2="${y}"/><circle class="p-${l}" cx="${lx(sm.median)}" cy="${y}" r="5"/>`;
      });
      s += `<rect class="hit" data-id="${esc(r.id)}|${r.kind}" x="0" y="${y - RH / 2}" width="${W}" height="${RH}"/>`;
    });
    $('#db', sec).innerHTML = `${s}</svg>`;
    sec.querySelectorAll('.hit').forEach((h) => {
      const [id, kind] = h.getAttribute('data-id').split('|');
      const row = D.rows.find((r) => r.id === id && r.kind === kind);
      h.addEventListener('pointermove', (e) => showTip(e, tipHtml(row, MAX)));
      h.addEventListener('pointerleave', hideTip);
    });
    return sec;
  }

  // ───────────────────────── table ─────────────────────────
  function table() {
    const sec = el('section');
    sec.innerHTML = `<div class="section-head"><div><h2>Every measurement</h2><p>Medians per call. “×” columns show before${HAS_AFTER ? ' → after' : ''}. Select a row for the query's origin, errors and Postgres plan.</p></div></div><div class="card"><table id="t"></table></div>`;
    const render = () => {
      const rows = D.rows
        .slice()
        .sort(
          (a, b) =>
            (med(b.cells[MAX]?.before) || 0) - (med(a.cells[MAX]?.before) || 0),
        );
      let h = `<thead><tr><th>Query</th><th>Tenant</th>${SCALES.map((s) => `<th>${s}×</th>`).join('')}<th>Status @${MAX}×</th>${HAS_AFTER ? `<th>Speed-up @${MAX}×</th><th>adj. p</th>` : ''}<th>SQL / call</th></tr></thead><tbody>`;
      rows.forEach((r) => {
        const key = `${r.id}|${r.kind}`,
          last = r.cells[MAX] || {};
        const st = statusOf(last.after || last.before, r.group),
          cmp = last.cmp;
        h += `<tr class="q"><td><button type="button" class="row-btn" data-k="${esc(key)}" aria-expanded="${state.open.has(key)}">${state.open.has(key) ? '▾' : '▸'} ${esc(r.id)}</button></td><td>${r.kind}</td>`;
        SCALES.forEach((s) => {
          const c = r.cells[s] || {};
          const b = med(c.before),
            a = med(c.after);
          h += `<td class="${b != null && b >= budgetOf(r.group).fail ? 'slow' : ''}">${c.before?.errors && b == null ? 'error' : fmt(b)}${HAS_AFTER && a != null ? ` → ${fmt(a)}` : ''}</td>`;
        });
        h += `<td>${pill(st)}</td>`;
        if (HAS_AFTER)
          h += `<td class="${cmp?.significant ? (cmp.speedup > 1 ? 'sig' : 'slow') : ''}">${cmp ? `${cmp.speedup.toFixed(2)}× (${cmp.speedupCi.low.toFixed(2)}–${cmp.speedupCi.high.toFixed(2)})` : '–'}</td><td>${cmp ? (cmp.adjustedP < 0.0001 ? '<0.0001' : cmp.adjustedP.toFixed(4)) : '–'}</td>`;
        const sd = last.after || last.before;
        h += `<td>${sd ? sd.statementsPerCall : '–'}</td></tr>`;
        if (state.open.has(key))
          h += `<tr class="detail"><td colspan="${SCALES.length + (HAS_AFTER ? 6 : 4)}">${detail(r)}</td></tr>`;
      });
      $('#t', sec).innerHTML = `${h}</tbody>`;
    };
    sec.addEventListener('click', (e) => {
      const b = e.target.closest('.row-btn');
      if (!b) return;
      const k = b.dataset.k;
      state.open.has(k) ? state.open.delete(k) : state.open.add(k);
      render();
    });
    render();
    return sec;
  }
  function planLine(p) {
    const flags = [];
    if (p.seqScans.length) flags.push(`seq scan: ${p.seqScans.join(', ')}`);
    if (p.externalSort) flags.push('sort spilled to disk');
    if (p.rowsRemovedByFilter > 1000)
      flags.push(`${p.rowsRemovedByFilter.toLocaleString()} rows filtered out`);
    return `<code>${Number.isNaN(p.executionMs) ? 'explain failed' : `${p.executionMs.toFixed(1)} ms`} · buffers hit ${p.bufferHit.toLocaleString()} / read ${p.bufferRead.toLocaleString()}${flags.length ? ` · ${esc(flags.join(' · '))}` : ''}<br>${esc(p.nodes.join(' › '))}<br>${esc(p.sql.slice(0, 220))}…</code>`;
  }
  function detail(r) {
    const last = r.cells[MAX] || {};
    let h = `<b>${esc(r.description)}</b><br>Source: <span style="font-family:var(--mono);font-size:12px">${esc(r.source)}</span>`;
    ['before', 'after'].forEach((l) => {
      const sd = last[l];
      if (!sd) return;
      h += `<div style="margin-top:8px"><b>${l} @ ${MAX}×</b>${sd.summary ? ` · median ${fmt(sd.summary.median)}, p95 ${fmt(sd.summary.p95)}, p99 ${fmt(sd.summary.p99)}, sd ${fmt(sd.summary.stdev)}, n=${sd.summary.n}` : ''}${sd.errors ? ` · <span class="slow">${sd.errors} errors (${sd.timeouts} timeouts): ${esc((sd.firstError || '').slice(0, 160))}</span>` : ''}`;
      sd.plans.slice(0, 4).forEach((p) => {
        h += planLine(p);
      });
      h += '</div>';
    });
    return h;
  }

  function notes() {
    const sec = el('section', { class: 'notes' });
    const c = D.config || {};
    sec.innerHTML = `<h2>How this was measured</h2>
      <p><b>Data.</b> Each scale is its own disposable database (${SCALES.map((s) => `${s}× = ${D.tenants[s] || '?'} tenants + 1 whale`).join('; ')}). Every table row is created from the same per-organisation fan-out, so relationships grow together: brands, credentials, posts and their ingredient links, analytics snapshots, activity, credit ledger, agent threads and messages, workflow runs and notifications. The whale's fan-out is multiplied by the scale.</p>
      <p><b>Queries.</b> Each one calls the production code path (services, controller query builders, worker sweeps) through the production Prisma client with the CLOUD tenant guard on, so what runs is what the API runs.</p>
      <p><b>Sampling.</b> ${c.rounds || 3} rounds, each in a shuffled order with a fresh warm-up of ${c.warmup || 5} calls, ${c.samples || 45} samples per query across the rounds, one call at a time, typical tenants chosen at random per call. A query that spends more than ${(c.budgetMs || 20000) / 1000} s is capped at 12 or more samples. Statements are cancelled after ${(c.statementTimeoutMs || 30000) / 1000} s and counted as failures.</p>
      <p><b>Statistics.</b> Latency is skewed, so medians and percentiles are reported with bootstrap intervals (1000 resamples). Before and after are compared per query and scale with a two-sided Mann-Whitney U test, adjusted across all ${D.comparisons || 0} comparisons with Holm-Bonferroni. A change is called significant only when the adjusted p is below 0.01 and the 95% interval of the median speed-up excludes 1.</p>
      <p><b>Limits.</b> One machine, warm caches (the 1000× database fits in the OS page cache), no concurrent load, so absolute numbers are lower than production; the shape of growth and the before/after ratios are what carry over. Budgets (slow ${BUDGET.interactive.warn} ms / fail ${BUDGET.interactive.fail} ms for interactive calls, ${BUDGET.sweep.warn} ms / ${BUDGET.sweep.fail} ms for sweeps) are this report's own thresholds.</p>`;
    return sec;
  }

  // ───────────────────────── tooltip ─────────────────────────
  const tip = $('#tip');
  function showTip(e, html) {
    tip.innerHTML = html;
    tip.hidden = false;
    const r = tip.getBoundingClientRect();
    tip.style.left = `${Math.min(window.innerWidth - r.width - 8, e.clientX + 14)}px`;
    tip.style.top =
      Math.max(8, Math.min(window.innerHeight - r.height - 8, e.clientY + 14)) +
      'px';
  }
  function hideTip() {
    tip.hidden = true;
  }

  const app = $('#app');
  for (const n of [header(), tiles(), panels(), dumbbell(), table(), notes()]) {
    app.appendChild(n);
  }
})();
