// Interactive explainer (no wallet, no chain). The UI is designed to teach humans.
// Model: Blueprint = template; Mission = blueprint-in-action; Checkpoint = step machine.

const SCENARIOS = {
  contract: {
    key: 'contract',
    title: 'A) Agent-to-agent Contract Negotiation (primary)',
    subtitle: 'Buyer agent + seller agent negotiate terms, then org gatekeepers attest before execution.',
    checkpoints: [
      {
        id: 'C1',
        title: 'Intake: capture scope',
        mode: 'enforced',
        explain: 'Input → agent captures requirements. On-chain stores mission variables (scope, budget, timeline).',
        action: (m) => {
          m.vars.scope = 'API integration + support';
          m.vars.budget = 12000;
          m.vars.timeline_days = 14;
          log(m, 'BuyerAgent: captured scope/budget/timeline.');
        },
      },
      {
        id: 'C2',
        title: 'Negotiate terms (loop)',
        mode: 'branch',
        explain: 'Agents exchange offers. Chain records the selected terms hash. Timeout escalates to human.',
        action: (m, flags) => {
          m.vars.negotiation_rounds = (m.vars.negotiation_rounds || 0) + 1;
          const rounds = m.vars.negotiation_rounds;
          if (flags.timeout && rounds >= 2) {
            m.vars.escalated = true;
            m.status = 'ESCALATED';
            log(m, 'Negotiation timed out → EscalateToHuman checkpoint (mission paused).');
            return { halt: true };
          }
          // converge to a deal
          m.vars.price = Math.max(9000, 14000 - rounds * 1000);
          m.vars.sla = rounds >= 2 ? 'gold' : 'silver';
          m.vars.terms_hash = hash(`${m.vars.scope}|${m.vars.price}|${m.vars.sla}|${m.vars.timeline_days}`);
          log(m, `SellerAgent: offered price=${m.vars.price}, sla=${m.vars.sla}.`);
          log(m, `BuyerAgent: accepted terms_hash=${m.vars.terms_hash.slice(0,8)}…`);
        },
      },
      {
        id: 'C3',
        title: 'Risk/Legal/Finance attest (2-of-3)',
        mode: 'attestation',
        explain: 'Critical checkpoint. Requires 2-of-3 attestations matching current terms_hash.',
        action: (m, flags) => {
          const required = 2;
          const roles = ['RiskAgent', 'LegalAgent', 'FinanceAgent'];
          const term = m.vars.terms_hash;

          // Create attestations
          const atts = [];
          for (const r of roles) {
            let decision = 'PASS';
            if (flags.conflict && r === 'LegalAgent') decision = 'FAIL';
            const forHash = flags.drift && r === 'FinanceAgent' ? hash(term + ':old') : term;
            atts.push({ role: r, decision, terms_hash: forHash });
          }
          m.atts = atts;

          const matchingPass = atts.filter(a => a.decision === 'PASS' && a.terms_hash === term);
          log(m, `Attestations collected. Matching PASS = ${matchingPass.length}/${required}.`);

          if (matchingPass.length < required) {
            m.status = 'BLOCKED';
            log(m, 'BLOCKED: not enough valid attestations for current terms. Route to ResolveDiscrepancy.');
            return { halt: true };
          }

          m.status = 'READY_TO_SIGN';
          log(m, 'OK: threshold met. Mission can proceed to signature/execution gating.');
        },
      },
      {
        id: 'C4',
        title: 'Signature + lock contract hash',
        mode: 'enforced',
        explain: 'On-chain locks the contract_hash. Future steps reference this immutable artifact.',
        action: (m) => {
          m.vars.contract_hash = hash('contract:' + m.vars.terms_hash);
          log(m, `Contract signed. contract_hash=${m.vars.contract_hash.slice(0,8)}…`);
        },
      },
      {
        id: 'C5',
        title: 'Fulfillment: milestone → payment release',
        mode: 'enforced',
        explain: 'Milestone attestations unlock on-chain actions (e.g., release funds). Disputes branch.',
        action: (m) => {
          m.vars.milestone_1 = 'DELIVERED';
          m.vars.payment_1 = 'RELEASED';
          log(m, 'SellerAgent: delivered milestone_1 (attested).');
          log(m, 'System: released payment_1 (gated by milestone completion).');
          m.status = 'DONE';
        },
      },
    ],
  },

  support: {
    key: 'support',
    title: 'B) Customer Support Agent Following On-chain Policy',
    subtitle: 'A support agent must follow exact escalation/refund guidelines with an audit trail.',
    checkpoints: [
      {
        id: 'S1',
        title: 'Authenticate customer',
        mode: 'attestation',
        explain: 'Attestation-based: agent attests identity check (SSO, email OTP, etc.).',
        action: (m) => {
          m.atts = [{ role: 'SupportAgent', decision: 'PASS', terms_hash: 'n/a' }];
          m.vars.customer_verified = true;
          log(m, 'SupportAgent attested customer_verified=true.');
        },
      },
      {
        id: 'S2',
        title: 'Classify issue + severity',
        mode: 'enforced',
        explain: 'On-chain stores case classification for consistency and later audits.',
        action: (m) => {
          m.vars.issue = 'billing_dispute';
          m.vars.severity = 'P2';
          log(m, 'SupportAgent classified issue=billing_dispute severity=P2.');
        },
      },
      {
        id: 'S3',
        title: 'Refund policy checkpoint (2-of-3 for >$500)',
        mode: 'attestation',
        explain: 'Refunds are powerful. For high amounts, require threshold signoff (SupportLead + Finance + Risk).',
        action: (m) => {
          m.vars.refund_amount = 800;
          m.atts = [
            { role: 'SupportLead', decision: 'PASS', terms_hash: 'refund:800' },
            { role: 'FinanceAgent', decision: 'PASS', terms_hash: 'refund:800' },
            { role: 'RiskAgent', decision: 'PASS', terms_hash: 'refund:800' },
          ];
          log(m, 'Refund approved via threshold attestations.');
        },
      },
      {
        id: 'S4',
        title: 'Execute refund + close case',
        mode: 'enforced',
        explain: 'On-chain execution follows exact guideline. Audit trail is built-in.',
        action: (m) => {
          m.vars.refund_status = 'EXECUTED';
          m.status = 'DONE';
          log(m, 'System executed refund and closed case.');
        },
      },
    ],
  },
};

function hash(s) {
  // not cryptographic—just stable for the explainer
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, '0') + (s.length.toString(16).padStart(4, '0'));
}

function log(m, msg) {
  m.log.push(msg);
}

const ui = {
  tabs: document.getElementById('tabs'),
  graph: document.getElementById('graph'),
  viz: document.getElementById('viz'),
  curId: document.getElementById('curId'),
  curExplain: document.getElementById('curExplain'),
  vars: document.getElementById('vars'),
  atts: document.getElementById('atts'),
  log: document.getElementById('log'),
  btnStart: document.getElementById('btnStart'),
  btnNext: document.getElementById('btnNext'),
  btnReset: document.getElementById('btnReset'),
  hiccupConflict: document.getElementById('hiccupConflict'),
  hiccupDrift: document.getElementById('hiccupDrift'),
  hiccupTimeout: document.getElementById('hiccupTimeout'),
};

let scenarioKey = 'contract';
let mission = null;
let lastCur = null;

// Canvas animation state
let anim = {
  fromIdx: 0,
  toIdx: 0,
  t0: 0,
  durationMs: 520,
  running: false,
};

function scenario() { return SCENARIOS[scenarioKey]; }

function renderTabs() {
  ui.tabs.innerHTML = '';
  for (const s of Object.values(SCENARIOS)) {
    const b = document.createElement('button');
    b.className = 'tab' + (s.key === scenarioKey ? ' active' : '');
    b.textContent = s.title;
    b.onclick = () => { scenarioKey = s.key; mission = null; lastCur = null; anim.running = false; renderAll(); };
    ui.tabs.appendChild(b);
  }
}

function renderGraph() {
  ui.graph.innerHTML = '';
  const cps = scenario().checkpoints;
  for (const cp of cps) {
    const d = document.createElement('div');
    d.className = 'node' + (mission && mission.cur === cp.id ? ' active' : '');
    d.innerHTML = `
      <div class="k">${cp.id} • ${badge(cp.mode)}</div>
      <div class="t">${cp.title}</div>
      <div class="meta">${cp.explain}</div>
    `;
    ui.graph.appendChild(d);
  }
}

function renderViz() {
  const canvas = ui.viz;
  if (!canvas) return;

  // Make canvas crisp on HiDPI.
  const cssWidth = canvas.clientWidth || 980;
  const cssHeight = 200;
  const dpr = Math.max(1, Math.floor(window.devicePixelRatio || 1));
  canvas.width = Math.floor(cssWidth * dpr);
  canvas.height = Math.floor(cssHeight * dpr);

  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const cps = scenario().checkpoints;
  const n = cps.length;
  const padX = 26;
  const y = 80;
  const step = n <= 1 ? 0 : (cssWidth - padX * 2) / (n - 1);

  const points = cps.map((cp, i) => ({
    id: cp.id,
    title: cp.title,
    mode: cp.mode,
    x: padX + step * i,
    y,
  }));

  const idxById = new Map(points.map((p, i) => [p.id, i]));
  const curIdx = mission ? idxById.get(mission.cur) ?? 0 : 0;
  const fromIdx = lastCur ? (idxById.get(lastCur) ?? curIdx) : curIdx;

  // Start an animation when checkpoint changes.
  if (mission && (anim.toIdx !== curIdx || !anim.running) && lastCur && lastCur !== mission.cur) {
    anim.fromIdx = fromIdx;
    anim.toIdx = curIdx;
    anim.t0 = performance.now();
    anim.running = true;
  }

  function draw(tNow) {
    const t = anim.running ? Math.min(1, (tNow - anim.t0) / anim.durationMs) : 1;

    // background
    ctx.clearRect(0, 0, cssWidth, cssHeight);

    // title
    ctx.fillStyle = 'rgba(148,163,184,0.9)';
    ctx.font = '12px ui-sans-serif, system-ui';
    ctx.fillText(scenario().subtitle, 18, 22);

    // connectors
    ctx.strokeStyle = 'rgba(36,48,64,1)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i], b = points[i + 1];
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
    }
    ctx.stroke();

    // nodes
    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      const isActive = mission && i === curIdx;

      ctx.fillStyle = '#0b121b';
      ctx.strokeStyle = isActive ? 'rgba(126,231,135,0.9)' : 'rgba(43,59,80,1)';
      ctx.lineWidth = isActive ? 3 : 2;

      // node circle
      ctx.beginPath();
      ctx.arc(p.x, p.y, 14, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // id label
      ctx.fillStyle = 'rgba(230,237,243,0.9)';
      ctx.font = '11px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(p.id, p.x, p.y);

      // mode mini-tag
      ctx.textBaseline = 'alphabetic';
      ctx.textAlign = 'center';
      ctx.font = '11px ui-sans-serif, system-ui';
      const tag = p.mode === 'enforced' ? 'ON-CHAIN' : (p.mode === 'attestation' ? 'ATTEST' : 'BRANCH');
      ctx.fillStyle = p.mode === 'enforced' ? 'rgba(31,111,235,0.9)' : (p.mode === 'attestation' ? 'rgba(242,204,96,0.9)' : 'rgba(148,163,184,0.9)');
      ctx.fillText(tag, p.x, p.y + 34);
    }

    // token position
    const fromP = points[anim.fromIdx] || points[0];
    const toP = points[anim.toIdx] || fromP;
    const ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    const tx = fromP.x + (toP.x - fromP.x) * ease;
    const ty = fromP.y + (toP.y - fromP.y) * ease - 26;

    // token
    ctx.fillStyle = 'rgba(126,231,135,0.95)';
    ctx.strokeStyle = 'rgba(126,231,135,0.6)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(tx, ty, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = 'rgba(230,237,243,0.9)';
    ctx.font = '11px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('M', tx, ty + 0.5);

    if (anim.running && t < 1) {
      requestAnimationFrame(draw);
    } else {
      anim.running = false;
      anim.fromIdx = anim.toIdx;
    }
  }

  requestAnimationFrame(draw);
}

function badge(mode) {
  if (mode === 'enforced') return '<span class="pill">Enforced on-chain</span>';
  if (mode === 'attestation') return '<span class="pill">Attestation-based</span>';
  return '<span class="pill">Branch / retry</span>';
}

function renderMission() {
  if (!mission) {
    ui.curId.textContent = '—';
    ui.curExplain.textContent = scenario().subtitle;
    ui.vars.textContent = '{\n  // start a mission\n}';
    ui.atts.textContent = '[\n  // none\n]';
    ui.log.textContent = 'Ready. This is an explainer: click Start new mission.';
    ui.btnNext.disabled = true;
    return;
  }

  ui.btnNext.disabled = mission.status === 'DONE' || mission.status === 'ESCALATED' || mission.status === 'BLOCKED';

  ui.curId.textContent = mission.cur;
  ui.curExplain.textContent = mission.curExplain;
  ui.vars.textContent = JSON.stringify(mission.vars, null, 2);
  ui.atts.textContent = JSON.stringify(mission.atts, null, 2);
  ui.log.textContent = mission.log.map((l, i) => `${String(i+1).padStart(2,'0')}. ${l}`).join('\n');
}

function renderAll() {
  renderTabs();
  renderViz();
  renderGraph();
  renderMission();
}

function startMission() {
  const first = scenario().checkpoints[0];
  mission = {
    id: `mission_${Math.random().toString(16).slice(2, 8)}`,
    cur: first.id,
    curExplain: first.explain,
    vars: {},
    atts: [],
    log: [],
    status: 'STARTED',
  };
  lastCur = null;
  log(mission, `Mission started from blueprint "${scenario().key}".`);
  log(mission, 'Key idea: chain enforces ordering + state, while some checkpoints accept attestations.');
  // run first checkpoint action immediately
  first.action(mission, flags());
  mission.curExplain = first.explain;
  renderAll();
}

function flags() {
  return {
    conflict: ui.hiccupConflict.checked,
    drift: ui.hiccupDrift.checked,
    timeout: ui.hiccupTimeout.checked,
  };
}

function nextCheckpoint() {
  const cps = scenario().checkpoints;
  const idx = cps.findIndex(c => c.id === mission.cur);
  lastCur = mission.cur;
  if (idx === -1) return;
  if (mission.status === 'DONE' || mission.status === 'ESCALATED' || mission.status === 'BLOCKED') return;

  const next = cps[idx + 1];
  if (!next) {
    mission.status = 'DONE';
    log(mission, 'Reached end of blueprint.');
    renderAll();
    return;
  }

  mission.cur = next.id;
  mission.curExplain = next.explain;
  const res = next.action(mission, flags()) || {};
  if (res.halt) {
    // keep current but stop progression
    renderAll();
    return;
  }

  renderAll();
}

function reset() {
  mission = null;
  lastCur = null;
  renderAll();
}

ui.btnStart.onclick = startMission;
ui.btnNext.onclick = nextCheckpoint;
ui.btnReset.onclick = reset;

window.addEventListener('resize', () => renderViz());
renderAll();
