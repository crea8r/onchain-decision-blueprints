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

function scenario() { return SCENARIOS[scenarioKey]; }

function renderTabs() {
  ui.tabs.innerHTML = '';
  for (const s of Object.values(SCENARIOS)) {
    const b = document.createElement('button');
    b.className = 'tab' + (s.key === scenarioKey ? ' active' : '');
    b.textContent = s.title;
    b.onclick = () => { scenarioKey = s.key; mission = null; renderAll(); };
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
  renderAll();
}

ui.btnStart.onclick = startMission;
ui.btnNext.onclick = nextCheckpoint;
ui.btnReset.onclick = reset;

renderAll();
