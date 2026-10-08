import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { reviewSchema } from './contracts/models.mjs';
const check = new Ajv2020({ strict: true, allErrors: true }).compile(reviewSchema);
const relative = (p) => !/^(?:[a-z]+:|[/\\])/i.test(p) && !p.split(/[/\\]/).includes('..');
function checkDiagram(c, side) {
    const d = c[side], ids = new Set(), cells = new Set();
    for (const n of d.nodes) {
        // A node may span columns; every covered cell must be free.
        for (let col = n.column; col < n.column + (n.span ?? 1); col++) {
            const cell = `${n.row}:${col}`;
            if (cells.has(cell))
                throw new Error(`Overlapping ${side} node: ${c.id}/${n.id}`);
            cells.add(cell);
        }
        if (ids.has(n.id))
            throw new Error(`Duplicate ${side} node: ${c.id}/${n.id}`);
        ids.add(n.id);
        if (n.evidence.some(i => i >= c.evidence.length))
            throw new Error(`Unknown evidence on ${side} node: ${c.id}/${n.id}`);
        if (side === 'before' && n.kind === 'deep')
            throw new Error(`Deep modules are proposals only: ${c.id}/${n.id}`);
        if (side === 'before' && (n.kind === 'module' || n.kind === 'step') && !n.evidence.length)
            throw new Error(`Current node needs evidence: ${c.id}/${n.id}`);
        if (n.kind === 'deep' ? !n.absorbs : n.absorbs)
            throw new Error(`Only deep modules absorb current nodes: ${c.id}/${n.id}`);
        if (n.absorbs?.some(id => !c.before.nodes.some(b => b.id === id)))
            throw new Error(`Deep module absorbs an unknown current node: ${c.id}/${n.id}`);
    }
    const edges = new Set();
    for (const e of d.edges) {
        const key = `${e.from}>${e.to}`;
        if (e.from === e.to || edges.has(key) || !ids.has(e.from) || !ids.has(e.to))
            throw new Error(`Invalid ${side} edge: ${c.id}/${key}`);
        edges.add(key);
    }
    for (const s of d.seams ?? [])
        if (!ids.has(s.below))
            throw new Error(`Seam below an unknown node: ${c.id}/${s.below}`);
}
export function validateReview(value) {
    if (!check(value))
        throw new Error(JSON.stringify(check.errors));
    const candidates = new Set();
    for (const p of [...value.workingTree.dirty, ...value.sources.map(s => s.path)])
        if (!relative(p))
            throw new Error(`Paths must be project-relative: ${p}`);
    for (const c of value.candidates) {
        if (candidates.has(c.id))
            throw new Error(`Duplicate candidate: ${c.id}`);
        candidates.add(c.id);
        checkDiagram(c, 'before');
        checkDiagram(c, 'after');
        const findings = new Set();
        for (const f of c.findings) {
            if (findings.has(f.id))
                throw new Error(`Duplicate finding: ${c.id}/${f.id}`);
            findings.add(f.id);
            if (f.targets.some(id => !c.before.nodes.some(n => n.id === id)))
                throw new Error(`Finding targets an unknown current node: ${c.id}/${f.id}`);
            if (f.evidence.some(i => i >= c.evidence.length))
                throw new Error(`Unknown evidence on finding: ${c.id}/${f.id}`);
        }
        if (c.strength === 'strong' && !c.findings.some(f => f.confidence === 'observed'))
            throw new Error(`Strong candidates need an observed finding: ${c.id}`);
        for (const e of c.evidence) {
            if (!relative(e.path))
                throw new Error(`Evidence paths must be project-relative: ${e.path}`);
            if (e.lines.end < e.lines.start || e.lines.end - e.lines.start > 40)
                throw new Error(`Evidence line range is invalid or longer than 41 lines: ${e.path}`);
            // The quote is the exact text of the cited lines, so it can be checked against the source.
            if (e.quote.replace(/\r\n?/g, '\n').split('\n').length !== e.lines.end - e.lines.start + 1)
                throw new Error(`Quote line count must match its range: ${e.path}:${e.lines.start}-${e.lines.end}`);
        }
    }
    if (value.recommendation && !candidates.has(value.recommendation.candidate))
        throw new Error(`Recommendation names an unknown candidate: ${value.recommendation.candidate}`);
}
// Compare each quote with the cited lines: the reviewed commit first, then the working tree, so
// uncommitted code under review can be quoted too.
export function verifyReviewQuotes(review, root) {
    const cache = new Map();
    const load = (file) => {
        if (!cache.has(file)) {
            const fromCommit = spawnSync('git', ['-C', root, 'show', `${review.sourceRevision}:${file.replace(/\\/g, '/')}`], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
            const disk = path.join(root, file), texts = [];
            if (fromCommit.status === 0)
                texts.push({ text: fromCommit.stdout, source: 'commit' });
            if (fs.existsSync(disk))
                texts.push({ text: fs.readFileSync(disk, 'utf8'), source: 'worktree' });
            cache.set(file, texts);
        }
        return cache.get(file);
    };
    const normalize = (text) => text.replace(/\r\n?/g, '\n').split('\n').map(l => l.trimEnd());
    const problems = [];
    const result = review.candidates.map(c => c.evidence.map((e) => {
        const texts = load(e.path);
        if (!texts.length) {
            problems.push(`${c.id}: ${e.path} not found`);
            return { state: 'unchecked' };
        }
        const quote = normalize(e.quote).join('\n');
        const match = texts.find(s => normalize(s.text).slice(e.lines.start - 1, e.lines.end).join('\n') === quote);
        if (!match) {
            problems.push(`${c.id}: quote differs from ${e.path}:${e.lines.start}-${e.lines.end} (${texts.map(s => s.source).join(', ')})`);
            return { state: 'unchecked' };
        }
        return { state: 'verified', source: match.source };
    }));
    if (problems.length)
        throw new Error(`Evidence quotes do not match the source:\n${problems.join('\n')}`);
    return result;
}
const escape = (value) => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
// ---- Diagram geometry ----
const COL = 212, ROW = 104, PAD = 28, GAP = 20;
// Rough rendered width of 12px label text: CJK glyphs are square, Latin about half as wide.
const textWidth = (s) => [...s].reduce((w, ch) => w + (ch.codePointAt(0) > 0x2e80 ? 12.5 : 6.9), 0);
// Absorbed-node chips inside a deep module wrap onto extra lines instead of squeezing their labels.
const CHIP_H = 32, CHIP_GAP = 10;
function chips(width, labels) {
    const room = width - 28, wanted = Math.max(...labels.map(textWidth)) + 18;
    const perLine = Math.max(1, Math.min(labels.length, Math.floor((room + CHIP_GAP) / (wanted + CHIP_GAP))));
    const lines = Math.ceil(labels.length / perLine);
    return { perLine, lines, w: (room - CHIP_GAP * (perLine - 1)) / perLine };
}
const deepHeight = (lines) => 46 + lines * CHIP_H + (lines - 1) * 8 + 14;
function layout(d, labelOf = id => id) {
    const boxes = new Map();
    // Empty leading rows and columns carry no meaning; drop them so the drawing starts at the margin.
    const r0 = Math.min(...d.nodes.map(n => n.row)), c0 = Math.min(...d.nodes.map(n => n.column));
    const cellWidth = (n) => (n.span ?? 1) * COL - GAP;
    const heightOf = (n) => n.kind === 'deep' ? deepHeight(chips(cellWidth(n), n.absorbs.map(labelOf)).lines) : n.kind === 'step' ? 38 : 48;
    // Rows grow to their tallest node (a deep module is taller); the gap between rows stays fixed.
    const rowTop = [];
    for (let r = r0, top = PAD; r <= Math.max(...d.nodes.map(n => n.row)); r++) {
        rowTop[r] = top;
        const inRow = d.nodes.filter(n => n.row === r);
        top += (inRow.length ? Math.max(48, ...inRow.map(heightOf)) : 0) + ROW - 48;
    }
    for (const n of d.nodes) {
        const cellW = cellWidth(n);
        const w = n.kind === 'deep' ? cellW : n.kind === 'step' ? Math.min(152, cellW) : Math.min(176, cellW);
        const h = heightOf(n);
        const x = PAD + (n.column - c0) * COL + (cellW - w) / 2, y = rowTop[n.row] + (n.kind === 'step' ? 5 : 0);
        boxes.set(n.id, { id: n.id, x, y, w, h, cx: x + w / 2, cy: y + h / 2, node: n });
    }
    const all = [...boxes.values()];
    return { boxes, width: Math.max(...all.map(b => b.x + b.w)) + PAD, height: Math.max(...all.map(b => b.y + b.h)) + PAD };
}
function route(a, b) {
    if (b.y >= a.y + a.h) {
        const sy = a.y + a.h, ty = b.y, mid = (sy + ty) / 2;
        return { d: Math.abs(a.cx - b.cx) < 2 ? `M${a.cx} ${sy} V${ty}` : `M${a.cx} ${sy} V${mid} H${b.cx} V${ty}`, lx: Math.max(a.cx, b.cx) + 6, ly: mid - 4 };
    }
    if (a.y >= b.y + b.h) {
        const sy = a.y, ty = b.y + b.h, mid = (sy + ty) / 2;
        return { d: Math.abs(a.cx - b.cx) < 2 ? `M${a.cx} ${sy} V${ty}` : `M${a.cx} ${sy} V${mid} H${b.cx} V${ty}`, lx: Math.max(a.cx, b.cx) + 6, ly: mid - 4 };
    }
    const right = b.x >= a.x + a.w, sx = right ? a.x + a.w : a.x, tx = right ? b.x : b.x + b.w, mx = (sx + tx) / 2;
    return { d: Math.abs(a.cy - b.cy) < 2 ? `M${sx} ${a.cy} H${tx}` : `M${sx} ${a.cy} H${mx} V${b.cy} H${tx}`, lx: mx - 20, ly: Math.min(a.cy, b.cy) - 8 };
}
// A pencil loop around a box that overshoots its start, seeded by position so output is stable.
function loop(b, pad) {
    let seed = Math.round(b.x * 7 + b.y * 13 + b.w) % 2147483647 || 3;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const cx = b.x + b.w / 2, cy = b.y + b.h / 2, rx = b.w / 2 + pad, ry = b.h / 2 + pad, points = [];
    for (let i = 0; i <= 26; i++) {
        const a = -2.2 + i / 24 * Math.PI * 2, k = 1 + (rnd() - .5) * .05, c = Math.cos(a), s = Math.sin(a);
        points.push(`${(cx + Math.sign(c) * Math.abs(c) ** .55 * rx * k + (rnd() - .5) * 3).toFixed(1)} ${(cy + Math.sign(s) * Math.abs(s) ** .55 * ry * k + (rnd() - .5) * 3).toFixed(1)}`);
    }
    return `M${points.join(' L')}`;
}
const CIRCLED = ['①', '②', '③', '④', '⑤', '⑥'];
const union = (bs) => { const x = Math.min(...bs.map(b => b.x)), y = Math.min(...bs.map(b => b.y)); return { x, y, w: Math.max(...bs.map(b => b.x + b.w)) - x, h: Math.max(...bs.map(b => b.y + b.h)) - y }; };
function diagramSvg(c, side, uid, t) {
    const labelOf = (nodeId) => c.before.nodes.find(n => n.id === nodeId)?.label ?? nodeId;
    const d = c[side], { boxes, width } = layout(d, labelOf);
    let { height } = layout(d, labelOf);
    const id = (s) => escape(s);
    const edges = d.edges.map(e => {
        const r = route(boxes.get(e.from), boxes.get(e.to));
        return `<path class="wire" d="${r.d}" marker-end="url(#${uid}-ah)"/>${e.label ? `<text class="wire-label" x="${r.lx}" y="${r.ly}">${escape(e.label)}</text>` : ''}`;
    }).join('');
    const nodes = d.nodes.map(n => {
        const b = boxes.get(n.id);
        if (n.kind === 'deep') {
            const labels = n.absorbs.map(labelOf), { perLine, w: iw } = chips(b.w, labels);
            // A label still too wide for its chip is shortened; the full text stays in the tooltip.
            const fit = (s) => { let out = s; while (out.length > 1 && textWidth(out) + 18 > iw)
                out = out.slice(0, -1); return out === s ? s : out.slice(0, -1) + '…'; };
            const chip = (label, i) => {
                const x = b.x + 14 + (i % perLine) * (iw + CHIP_GAP), y = b.y + 44 + Math.floor(i / perLine) * (CHIP_H + 8);
                return `<g><title>${escape(label)}</title><rect class="inner" x="${x}" y="${y}" width="${iw}" height="${CHIP_H}"/><text class="sub" x="${x + iw / 2}" y="${y + 21}" text-anchor="middle">${escape(fit(label))}</text></g>`;
            };
            return `<g class="node" data-node="${id(n.id)}"><rect class="deep" x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}"/><text class="lbl" x="${b.x + 16}" y="${b.y + 26}">${escape(n.label)}</text>${labels.map(chip).join('')}</g>`;
        }
        return `<g class="node" data-node="${id(n.id)}"><rect class="box ${n.kind}" x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}"/><text class="${n.kind === 'step' ? 'sub' : 'lbl'}" x="${b.cx}" y="${b.cy + 5}" text-anchor="middle">${escape(n.label)}</text></g>`;
    }).join('');
    const seams = (d.seams ?? []).map(s => {
        const b = boxes.get(s.below), y = b.y + b.h + 24;
        return `<line class="seam" x1="${PAD / 2}" y1="${y}" x2="${width - PAD / 2}" y2="${y}"/><text class="seam-label" x="${PAD / 2 + 4}" y="${y - 5}">${escape(t('接缝：', 'Seam: ') + s.label)}</text>`;
    }).join('');
    let marks = '';
    if (side === 'before') {
        // Red pencil: one mark per finding, numbered to match the notes beside the drawing.
        const placed = [...boxes.values()];
        const hits = (r) => placed.some(p => r.x < p.x + p.w && r.x + r.w > p.x && r.y < p.y + p.h && r.y + r.h > p.y);
        const note = (text, x, y) => {
            const w = [...text].length * 19 + 8, r = { x: Math.max(6, Math.min(x, width - w - 6)), y: y - 20, w, h: 26 };
            while (hits(r))
                r.y += 26;
            placed.push(r);
            height = Math.max(height, r.y + r.h + 14);
            return `<text class="hand" x="${r.x}" y="${r.y + 20}">${escape(text)}</text>`;
        };
        c.findings.forEach((f, i) => {
            const ts = f.targets.map(target => boxes.get(target)), u = union(ts), label = `${CIRCLED[i]} ${f.note}`;
            if (f.kind === 'duplicate') {
                marks += ts.map(b => `<path class="red" d="${loop(b, 10)}"/>`).join('');
                for (let k = 1; k < ts.length; k++) {
                    const a = ts[k - 1], b = ts[k];
                    marks += `<path class="red" d="M${a.cx} ${a.y + a.h + 10} C ${a.cx} ${a.y + a.h + 44}, ${b.cx} ${b.y + b.h + 44}, ${b.cx} ${b.y + b.h + 10}"/>`;
                }
                marks += note(label, (u.x + u.w / 2) - 80, u.y + u.h + 52);
            }
            else if (f.kind === 'leak') {
                marks += `<path class="red" d="${loop(u, 12)}"/><path class="red" d="M${u.x + u.w + 8} ${u.y + u.h + 8} l 34 30" marker-end="url(#${uid}-rh)"/>`;
                marks += note(label, u.x + u.w + 30, u.y + u.h + 58);
            }
            else if (f.kind === 'shallow') {
                marks += ts.map(b => `<path class="red" d="M${b.x - 6} ${b.y + b.h + 4} L${b.x + b.w + 6} ${b.y - 4}"/>`).join('');
                marks += note(label, u.x + u.w + 16, u.y + 22);
            }
            else if (f.kind === 'ordering') {
                marks += ts.map(b => { let p = `M${b.x} ${b.y + b.h + 8}`; for (let x = b.x; x < b.x + b.w; x += 16)
                    p += ` q 4 -6 8 0 q 4 6 8 0`; return `<path class="red" d="${p}"/>`; }).join('');
                marks += note(label, u.x, u.y + u.h + 40);
            }
            else {
                const a = ts[0], b = ts[1] ?? ts[0];
                marks += `<path class="red dashed" d="M${a.cx} ${a.cy} L${b.cx} ${b.cy}"/>`;
                marks += note(label, (a.cx + b.cx) / 2 + 8, (a.cy + b.cy) / 2);
            }
        });
    }
    // Keep the bottom-right corner free for the title block (current) or the seal (proposal).
    height += side === 'before' ? 80 : 56;
    return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${escape(side === 'before' ? t('现状图', 'Current drawing') : t('誊清稿', 'Clean redraw'))}"><defs>
<filter id="${uid}-rough"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" seed="5"/><feDisplacementMap in="SourceGraphic" scale="1.6"/></filter>
<marker id="${uid}-ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L10 5L0 10z" class="ah"/></marker>
<marker id="${uid}-rh" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="8" markerHeight="8" orient="auto"><path d="M0 1L9 5L0 9" class="rh"/></marker>
</defs>${seams}${edges}${nodes}<g style="filter:url(#${uid}-rough)">${marks}</g></svg>`;
}
export function renderReview(value, { quotes, views } = {}) {
    validateReview(value);
    const r = value, zh = r.language === 'zh';
    const t = (cn, en) => zh ? cn : en;
    const file = (name) => new URL(`../${name}`, import.meta.url);
    const read = (name) => fs.readFileSync(file(name), 'utf8').replace(/\r\n?/g, '\n');
    const dataUrl = (name, type) => `data:${type};base64,${fs.readFileSync(file(name)).toString('base64')}`;
    const icon = (name) => read(`node_modules/lucide-static/icons/${name}.svg`).replace(/<!--[\s\S]*?-->/g, '').replace(/\s*\n\s*/g, ' ').replace(/ class="[^"]*"/, ' class="icon" aria-hidden="true" focusable="false"').replace(/ width="24" height="24"/, '').trim();
    const strength = { strong: t('证据有力', 'Strong'), 'worth-exploring': t('值得探索', 'Worth exploring'), speculative: t('推测', 'Speculative') };
    const dependency = { 'in-process': t('进程内', 'In-process'), 'local-substitutable': t('可用本地替身', 'Local stand-in'), 'ports-adapters': t('端口与适配器', 'Ports & adapters'), external: t('外部依赖', 'External') };
    const confidence = { observed: t('已观察', 'Observed'), hypothesis: t('待验证', 'Hypothesis') };
    const verdict = { keep: t('保留', 'Keep'), remove: t('可删除', 'Remove'), narrow: t('收窄', 'Narrow') };
    const win = { locality: t('局部性', 'Locality'), leverage: t('杠杆', 'Leverage'), depth: t('深度', 'Depth'), seam: t('接缝', 'Seam'), testability: t('可测性', 'Testability') };
    const num = (i) => String(i + 1).padStart(2, '0');
    const list = (items, cls) => `<ul class="${cls}">${items.map(s => `<li>${escape(s)}</li>`).join('')}</ul>`;
    const sheets = r.candidates.map((c, i) => {
        const uid = `c${i}`;
        const evidence = c.evidence.map((e, k) => {
            const q = quotes?.[i]?.[k];
            const status = q?.state === 'verified' ? `<span class="verified">${icon('check')}${t('已与源码核对', 'Matches source')}</span>` : `<span class="unchecked">${t('未核对', 'Not checked')}</span>`;
            const numbered = e.quote.replace(/\r\n?/g, '\n').split('\n').map((line, n) => `<span class="ln">${e.lines.start + n}</span>${escape(line)}`).join('\n');
            return `<article class="slip"><div class="slip-head"><code>${escape(e.path)} · ${e.lines.start}–${e.lines.end}</code>${e.symbol ? `<span>${escape(e.symbol)}</span>` : ''}${status}</div><pre>${numbered}</pre><p class="hand-note">${escape(e.note)}</p></article>`;
        }).join('');
        const findings = c.findings.map((f, k) => `<li><span class="hand-num">${CIRCLED[k]}</span><div><b>${escape(f.note)}</b><span class="conf" data-confidence="${f.confidence}">${confidence[f.confidence]}</span><p>${escape(f.detail)}</p></div></li>`).join('');
        return `<section class="sheet-page" data-sheet="${i}"${i ? ' hidden' : ''}>
<div class="head"><div class="no" aria-hidden="true">${num(i)}</div><div><h1>${escape(c.title)}</h1><p class="lede">${escape(c.lede)}</p>
<p class="meta">${strength[c.strength]} · ${t('依赖', 'Dependency')}：${dependency[c.dependency]} · ${t('业务影响', 'Impact')}：${escape(c.impact)}</p></div></div>
<div class="row">
  <div><p class="cap"><b>${t('现状图', 'Current drawing')}</b>${t('据源码绘制 · 红笔为评审批注', 'Drawn from source · red pencil marks review judgments')}</p>
    <div class="sheet">${diagramSvg(c, 'before', `${uid}b`, t)}<div class="titleblock"><span>${t('图号', 'Sheet')}</span><span>${num(i)} / ${t('现状', 'Current')}</span><span>${t('批注', 'Marks')}</span><span>${c.findings.length}</span><span>${t('依据', 'Evidence')}</span><span>${t(`源码 ${c.evidence.length} 处`, `${c.evidence.length} source excerpts`)}</span></div></div>
    <p class="caption">${escape(c.before.caption)}</p>
    <ol class="findings">${findings}</ol></div>
  <aside class="margin-notes"><h3>${t('调用方现在要记住：', 'Callers must remember:')}</h3><ol>${c.callerKnowledge.before.map(s => `<li>${escape(s)}</li>`).join('')}</ol>
    <div class="after"><h3>${c.callerKnowledge.after.length ? t('收拢之后只剩：', 'After the change, only:') : t('收拢之后：无需额外记忆', 'After the change: nothing extra')}</h3>${c.callerKnowledge.after.length ? `<ol>${c.callerKnowledge.after.map(s => `<li>${escape(s)}</li>`).join('')}</ol>` : ''}</div></aside>
</div>
<div class="row redraw">
  <div><p class="cap"><b>${t('誊清稿', 'Clean redraw')}</b>${t('候选职责 · 未实施', 'Proposed responsibilities · not implemented')}</p>
    <div class="sheet">${diagramSvg(c, 'after', `${uid}a`, t)}<span class="seal">${t('建议稿', 'Proposal')}</span></div>
    <p class="caption">${escape(c.after.caption)}</p></div>
  <div class="evidence">${evidence}</div>
</div>
<div class="prose">
  <div><h4>${t('方案', 'Solution')}</h4><p>${escape(c.solution)}</p></div>
  <div><h4>${t('删除测试', 'Deletion test')} · ${verdict[c.deletionTest.verdict]}</h4><p class="hand-note">${escape(c.deletionTest.text)}</p></div>
  <div><h4>${t('不改变', 'Unchanged')}</h4>${c.boundaries.length ? list(c.boundaries, 'plain') : `<p>${t('未列出', 'None listed')}</p>`}</div>
</div>
<div class="prose">
  <div><h4>${t('收益', 'Wins')}</h4><ul class="wins">${c.wins.map(w => `<li><b>${win[w.kind]}</b>${escape(w.text)}</li>`).join('')}</ul></div>
  <div><h4>${t('迁移代价', 'Migration cost')}</h4><p>${escape(c.cost)}</p></div>
  <div>${c.adrConflict ? `<h4>${t('与既有决策冲突', 'Conflicts with a recorded decision')}</h4><p><code>${escape(c.adrConflict.path)}</code> ${escape(c.adrConflict.reason)}</p>` : ''}</div>
</div>
<div class="verify"><h4>${t('通过 Interface 验证', 'Verify through the interface')}</h4>${list(c.verification, 'checks')}</div>
</section>`;
    }).join('');
    const rec = r.recommendation ? r.candidates.findIndex(c => c.id === r.recommendation.candidate) : -1;
    const recommendation = rec >= 0 ? `<div class="recommend"><span class="hand">${t('建议先做', 'Start with')}</span><b>${num(rec)} · ${escape(r.candidates[rec].title)}</b><span>${escape(r.recommendation.reason)}</span><button type="button" data-goto="${rec}">${t('查看', 'Open')}</button></div>` : '';
    const tabs = r.candidates.length > 1 ? `<nav class="tabs" aria-label="${t('评审候选', 'Review candidates')}">${r.candidates.map((c, i) => `<button type="button" data-goto="${i}" aria-pressed="${i === 0}"><span>${num(i)}</span>${escape(c.title)}</button>`).join('')}</nav>` : '';
    const empty = `<div class="empty"><h1>${t('未发现有充分依据的改进候选', 'No sufficiently supported improvement candidates')}</h1><p>${t('已检查的范围列在下方；证据不足的设想不会作为候选列出。', 'The checked scope is listed below; ideas without sufficient evidence are not listed as candidates.')}</p></div>`;
    const version = JSON.parse(read('package.json')).version;
    const shortRev = /^[0-9a-f]{40}$/i.test(r.sourceRevision) ? r.sourceRevision.slice(0, 12) : r.sourceRevision;
    const kinds = { glossary: t('术语表', 'Glossary'), adr: t('架构决策', 'ADR'), rule: t('规则', 'Rule'), doc: t('文档', 'Doc') };
    const footer = `<footer class="foot"><div><h4>${t('评审范围', 'Scope')}</h4><p>${escape(r.scope)}</p></div>
<div><h4>${t('已知缺口', 'Known gaps')}</h4>${r.gaps.length ? list(r.gaps, 'plain') : `<p>${t('无', 'None')}</p>`}</div>
<div><h4>${t('读过的依据', 'Sources read')}</h4>${r.sources.length ? `<ul class="plain">${r.sources.map(s => `<li>${kinds[s.kind]} · <code>${escape(s.path)}</code></li>`).join('')}</ul>` : `<p>${t('未找到术语表或架构决策文档', 'No glossary or decision records found')}</p>`}
${r.workingTree.dirty.length ? `<h4>${t('工作区未提交改动', 'Uncommitted files')}</h4><ul class="plain">${r.workingTree.dirty.map(p => `<li><code>${escape(p)}</code></li>`).join('')}</ul>` : ''}</div>
<p class="disclaimer">${t('建议未实施。请在对话中确认具体方案；本页不代表批准，也不会修改代码。', 'Proposals are not implemented. Confirm a specific plan in conversation; this page grants no approval and changes no code.')}</p>
<p class="revs">Birdview ${escape(version)} · ${t('评审版本', 'Review')} <code>${escape(r.revision)}</code> · ${t('源码版本', 'Source')} <code title="${escape(r.sourceRevision)}">${escape(shortRev)}</code></p></footer>`;
    if (views && !/^[a-zA-Z0-9%._-]+\.html$/.test(views.architectureHref))
        throw new Error('Architecture link must be a sibling HTML filename');
    const nav = views
        ? `<nav class="views" aria-label="${t('项目视图', 'Project views')}"><a href="${escape(views.architectureHref)}">${t('架构', 'Architecture')}</a>${views.constraints ? `<a href="${escape(views.architectureHref)}#view=constraints">${t('约束', 'Constraints')}</a>` : ''}<a aria-current="page">${t('评审', 'Review')}</a></nav>`
        : `<span class="chip">${t('架构评审', 'Architecture review')}</span>`;
    const header = `<header class="app-header"><img src="${dataUrl('assets/brand/logo-192.png', 'image/png')}" alt="" width="34" height="34"><span class="project">${escape(r.project)}</span>${nav}<div class="actions"><button type="button" class="theme-toggle" aria-label="${t('切换明暗主题', 'Toggle light or dark theme')}"><span class="sun">${icon('sun')}</span><span class="moon">${icon('moon')}</span></button></div></header>`;
    const intro = `<div class="intro"><p class="strip">${t('架构评审', 'Architecture review')} · ${escape(r.revision)}<span>${t(`${r.candidates.length} 个候选`, `${r.candidates.length} candidates`)}</span></p>${r.baseline ? `<p class="baseline"><b>${t('本轮基线', 'Baseline')}</b>${escape(r.baseline)}</p>` : ''}${recommendation}${tabs}</div>`;
    return `<!doctype html><html lang="${r.language}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(r.project)} · ${t('架构评审', 'Architecture review')} · Birdview</title><link rel="icon" href="${dataUrl('assets/brand/favicon-32.png', 'image/png')}"><script>${read('assets/theme.js')}</script><style>${read('assets/review.css')}</style></head><body>${header}<main class="page">${intro}${sheets || empty}${footer}</main><script>${read('assets/review.js')}</script></body></html>`;
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
    try {
        const args = process.argv.slice(2);
        let root;
        const repo = args.indexOf('--repo');
        if (repo !== -1) {
            root = args[repo + 1];
            if (!root || root.startsWith('--'))
                throw new Error('--repo requires a repository root');
            args.splice(repo, 2);
        }
        const [input, output, ...extra] = args;
        if (!input || !output || extra.length || !/\.html$/i.test(output))
            throw new Error('Usage: node scripts/render-review.mjs review.json review.html [--repo repository-root]');
        if (path.resolve(input).toLowerCase() === path.resolve(output).toLowerCase())
            throw new Error('Input and output must differ');
        const review = JSON.parse(fs.readFileSync(input, 'utf8'));
        validateReview(review);
        const html = renderReview(review, root ? { quotes: verifyReviewQuotes(review, root) } : {});
        fs.mkdirSync(path.dirname(path.resolve(output)), { recursive: true });
        fs.writeFileSync(output, html);
        console.log(path.resolve(output));
    }
    catch (error) {
        console.error(error instanceof Error ? error.message : error);
        process.exitCode = 1;
    }
}
