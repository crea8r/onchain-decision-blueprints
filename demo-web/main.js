import {
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  clusterApiUrl,
} from 'https://esm.sh/@solana/web3.js@1.95.4?bundle';

// ---- borsh helpers (minimal) ----
import { serialize } from 'https://esm.sh/borsh@2.0.0?bundle';

// Match Rust enum discriminants order in program/src/instruction.rs
const IX = {
  InitializeBlueprint: 0,
  ProposeAction: 1,
  ApproveAction: 2,
  ExecuteAction: 3,
};

class InitializeBlueprint {
  constructor(fields) {
    Object.assign(this, fields);
  }
}
class ProposeAction {
  constructor(fields) {
    Object.assign(this, fields);
  }
}
class Empty {}

// Borsh schema for our instruction enum wrapper
// We encode as: u8 variant + variant struct.
// NOTE: For Vec<Pubkey>, borsh expects bytes; we encode as Vec<[u8;32]>
const Schema = new Map([
  [InitializeBlueprint, { kind: 'struct', fields: [['approvers', ['u8']], ['threshold', 'u8']] }],
]);

// We will implement custom packing to keep it explicit and stable.
function u8(n) { return new Uint8Array([n & 0xff]); }
function u16le(n) {
  const b = new Uint8Array(2);
  b[0] = n & 0xff;
  b[1] = (n >> 8) & 0xff;
  return b;
}
function u32le(n) {
  const b = new Uint8Array(4);
  b[0] = n & 0xff;
  b[1] = (n >> 8) & 0xff;
  b[2] = (n >> 16) & 0xff;
  b[3] = (n >> 24) & 0xff;
  return b;
}
function concat(...arrs) {
  const len = arrs.reduce((s,a)=>s+a.length,0);
  const out = new Uint8Array(len);
  let o=0;
  for (const a of arrs) { out.set(a, o); o += a.length; }
  return out;
}

async function sha256Bytes(text) {
  const enc = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest('SHA-256', enc);
  return new Uint8Array(hash);
}

function logLine(s) {
  const el = document.getElementById('log');
  el.textContent += s + "\n";
  el.scrollTop = el.scrollHeight;
}
function setWalletState(status, cls='warn') {
  const el = document.getElementById('walletState');
  el.innerHTML = `wallet: <span class="${cls}">${status}</span>`;
}

function getProvider() {
  if ('solana' in window) return window.solana;
  return null;
}

function getRpcUrl() {
  const v = document.getElementById('rpcUrl').value.trim();
  return v || clusterApiUrl('devnet');
}
function getProgramId() {
  const v = document.getElementById('programId').value.trim();
  if (!v) throw new Error('Program ID required (deploy program to devnet first).');
  return new PublicKey(v);
}

function parseApprovers() {
  const lines = document.getElementById('approvers').value
    .split(/\r?\n/)
    .map(s => s.trim())
    .filter(Boolean);
  return lines.map(l => new PublicKey(l));
}

async function deriveBlueprintPda(programId, authorityPk) {
  const [pda] = await PublicKey.findProgramAddress(
    [new TextEncoder().encode('blueprint'), authorityPk.toBytes()],
    programId
  );
  return pda;
}

async function deriveProposalPda(programId, blueprintPda, payloadHash32) {
  const [pda] = await PublicKey.findProgramAddress(
    [new TextEncoder().encode('proposal'), blueprintPda.toBytes(), payloadHash32],
    programId
  );
  return pda;
}

function packInitializeBlueprint(approvers, threshold) {
  // Rust: InitializeBlueprint { approvers: Vec<Pubkey>, threshold: u8 }
  // borsh: variant u8 + vec_len u32 + vec items(32 bytes each) + threshold u8
  const items = approvers.map(pk => pk.toBytes());
  const len = u32le(items.length);
  const body = concat(len, ...items, u8(threshold));
  return concat(u8(IX.InitializeBlueprint), body);
}

function packProposeAction(actionType, payloadHash32) {
  // Rust: ProposeAction { action_type: u16, payload_hash: [u8;32] }
  return concat(u8(IX.ProposeAction), u16le(actionType), payloadHash32);
}

function packApprove() {
  return u8(IX.ApproveAction);
}

function packExecute() {
  return u8(IX.ExecuteAction);
}

let walletPk = null;
let last = {
  blueprintPda: null,
  proposalPda: null,
  payloadHash: null,
};

async function sendTx(ixs) {
  const provider = getProvider();
  const conn = new Connection(getRpcUrl(), 'confirmed');
  const tx = new Transaction().add(...ixs);
  tx.feePayer = walletPk;
  const { blockhash } = await conn.getLatestBlockhash('finalized');
  tx.recentBlockhash = blockhash;

  const signed = await provider.signTransaction(tx);
  const sig = await conn.sendRawTransaction(signed.serialize());
  logLine(`→ sent: ${sig}`);
  const conf = await conn.confirmTransaction(sig, 'confirmed');
  logLine(`✓ confirmed: ${sig}`);
  return sig;
}

async function connect() {
  const provider = getProvider();
  if (!provider) throw new Error('No Solana provider found. Install Phantom.');
  const resp = await provider.connect();
  walletPk = new PublicKey(resp.publicKey.toString());
  document.getElementById('authority').value = walletPk.toBase58();
  setWalletState(walletPk.toBase58().slice(0, 4) + '…' + walletPk.toBase58().slice(-4), 'ok');
  logLine('Connected wallet ' + walletPk.toBase58());
}

async function disconnect() {
  const provider = getProvider();
  if (provider?.disconnect) await provider.disconnect();
  walletPk = null;
  document.getElementById('authority').value = '';
  setWalletState('disconnected', 'warn');
}

async function initBlueprint() {
  if (!walletPk) throw new Error('Connect wallet first');
  const programId = getProgramId();
  const conn = new Connection(getRpcUrl(), 'confirmed');

  const authority = walletPk;
  const blueprintPda = await deriveBlueprintPda(programId, authority);

  const approvers = parseApprovers();
  const threshold = parseInt(document.getElementById('threshold').value, 10);
  if (!Number.isFinite(threshold) || threshold <= 0) throw new Error('Invalid threshold');

  const data = packInitializeBlueprint(approvers, threshold);

  const ix = new TransactionInstruction({
    programId,
    keys: [
      { pubkey: authority, isSigner: true, isWritable: true },
      { pubkey: blueprintPda, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });

  logLine('Initializing blueprint PDA ' + blueprintPda.toBase58());
  await sendTx([ix]);
  last.blueprintPda = blueprintPda;
}

async function propose() {
  if (!walletPk) throw new Error('Connect wallet first');
  const programId = getProgramId();
  if (!last.blueprintPda) throw new Error('Initialize blueprint first');

  const actionType = parseInt(document.getElementById('actionType').value, 10);
  const payload = document.getElementById('payload').value || '';
  const payloadHash = await sha256Bytes(payload);

  const proposalPda = await deriveProposalPda(programId, last.blueprintPda, payloadHash);
  const data = packProposeAction(actionType, payloadHash);

  const ix = new TransactionInstruction({
    programId,
    keys: [
      { pubkey: walletPk, isSigner: true, isWritable: true },
      { pubkey: last.blueprintPda, isSigner: false, isWritable: false },
      { pubkey: proposalPda, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });

  logLine('Proposing action. payload_hash=' + Buffer.from(payloadHash).toString('hex'));
  await sendTx([ix]);
  last.proposalPda = proposalPda;
  last.payloadHash = payloadHash;
  logLine('Proposal PDA ' + proposalPda.toBase58());
}

async function approve() {
  if (!walletPk) throw new Error('Connect wallet first');
  const programId = getProgramId();
  if (!last.blueprintPda || !last.proposalPda) throw new Error('Propose first');

  const data = packApprove();
  const ix = new TransactionInstruction({
    programId,
    keys: [
      { pubkey: walletPk, isSigner: true, isWritable: false },
      { pubkey: last.blueprintPda, isSigner: false, isWritable: false },
      { pubkey: last.proposalPda, isSigner: false, isWritable: true },
    ],
    data,
  });

  logLine('Approving proposal ' + last.proposalPda.toBase58());
  await sendTx([ix]);
}

async function execute() {
  if (!walletPk) throw new Error('Connect wallet first');
  const programId = getProgramId();
  if (!last.blueprintPda || !last.proposalPda) throw new Error('Propose first');

  const data = packExecute();
  const ix = new TransactionInstruction({
    programId,
    keys: [
      { pubkey: walletPk, isSigner: true, isWritable: false },
      { pubkey: last.blueprintPda, isSigner: false, isWritable: false },
      { pubkey: last.proposalPda, isSigner: false, isWritable: true },
    ],
    data,
  });

  logLine('Executing proposal ' + last.proposalPda.toBase58());
  await sendTx([ix]);
}

function wire() {
  document.getElementById('btnConnect').onclick = () => connect().catch(e => logLine('ERROR: ' + e.message));
  document.getElementById('btnDisconnect').onclick = () => disconnect().catch(e => logLine('ERROR: ' + e.message));
  document.getElementById('btnInit').onclick = () => initBlueprint().catch(e => logLine('ERROR: ' + e.message));
  document.getElementById('btnPropose').onclick = () => propose().catch(e => logLine('ERROR: ' + e.message));
  document.getElementById('btnApprove').onclick = () => approve().catch(e => logLine('ERROR: ' + e.message));
  document.getElementById('btnExecute').onclick = () => execute().catch(e => logLine('ERROR: ' + e.message));

  const provider = getProvider();
  if (provider?.isPhantom) {
    provider.on('connect', () => logLine('wallet event: connect'));
    provider.on('disconnect', () => logLine('wallet event: disconnect'));
  }

  logLine('Ready. Install Phantom, switch to devnet, paste Program ID, then run the flow.');
}

wire();
