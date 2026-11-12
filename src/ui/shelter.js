// 집 안 장면(SVG): 집에 있는 사람과 재고 물품을 그림으로 보여 준다.
// 재고가 생기면 선반에 물건이 나타나고, 다 쓰면 사라진다. 사람은 상태에 따라 모습이 바뀐다.
import { HUNGER_NOTICE, HUNGER_WEAK, THIRST_NOTICE, THIRST_WEAK } from '../core/constants.js';
import { RESOURCES, SERVINGS, formatAmount } from '../core/items.js';
import { esc } from './dom.js';

const FLOOR = 262;

// ── 물품 아이콘 (x, y = 바닥 기준점) ──────────────

const icon = {
  food: (x, y) => `<g transform="translate(${x} ${y})">
      <rect x="0" y="-22" width="16" height="22" rx="2" fill="#b8c0c8"/>
      <rect x="0" y="-16" width="16" height="9" fill="#c4512f"/>
      <ellipse cx="8" cy="-22" rx="8" ry="2.5" fill="#dde2e7"/></g>`,
  water: (x, y) => `<g transform="translate(${x} ${y})">
      <rect x="0" y="-30" width="12" height="30" rx="4" fill="#7cc4f0" opacity=".9"/>
      <rect x="3" y="-36" width="6" height="7" rx="1.5" fill="#2f6fb0"/>
      <rect x="0" y="-20" width="12" height="7" fill="#eaf6fc" opacity=".85"/></g>`,
  med: (x, y) => `<g transform="translate(${x} ${y})">
      <rect x="9" y="-25" width="10" height="6" rx="2" fill="none" stroke="#c9c9c9" stroke-width="2"/>
      <rect x="0" y="-20" width="28" height="20" rx="3" fill="#f3f3f3"/>
      <rect x="11" y="-17" width="6" height="14" fill="#d8392f"/>
      <rect x="7" y="-13" width="14" height="6" fill="#d8392f"/></g>`,
  radio: (x, y) => `<g transform="translate(${x} ${y})">
      <line x1="28" y1="-24" x2="38" y2="-46" stroke="#9aa3ad" stroke-width="2"/>
      <rect x="0" y="-26" width="36" height="26" rx="4" fill="#3d4651"/>
      <circle cx="11" cy="-13" r="7" fill="#262c33"/>
      <circle cx="11" cy="-13" r="3" fill="#4d5762"/>
      <rect x="22" y="-20" width="10" height="5" rx="1" fill="#a6e3a1"/>
      <circle cx="27" cy="-8" r="3" fill="#c9ced4"/></g>`,
  battery: (x, y) => `<g transform="translate(${x} ${y})">
      <rect x="2.5" y="-20" width="5" height="3" fill="#bbb"/>
      <rect x="0" y="-18" width="10" height="18" rx="2" fill="#e0b030"/>
      <rect x="0" y="-7" width="10" height="7" rx="2" fill="#2a2a2a"/></g>`,
  flare: (x, y) => `<g transform="translate(${x} ${y})">
      <rect x="0" y="-28" width="7" height="28" rx="2" fill="#e0462f"/>
      <rect x="0" y="-31" width="7" height="5" rx="1" fill="#f4d35e"/></g>`,
  toolkit: (x, y) => `<g transform="translate(${x} ${y})">
      <rect x="12" y="-28" width="18" height="8" rx="3" fill="none" stroke="#7a1f17" stroke-width="3"/>
      <rect x="0" y="-22" width="42" height="22" rx="3" fill="#c0392b"/>
      <rect x="0" y="-14" width="42" height="3" fill="#7a1f17"/></g>`,
  map: (x, y) => `<g transform="translate(${x} ${y})">
      <polygon points="0,0 10,-4 20,0 30,-4 30,-24 20,-20 10,-24 0,-20" fill="#e9dfbf"/>
      <polyline points="3,-8 9,-14 15,-10 24,-17" fill="none" stroke="#c0392b" stroke-width="1.5"/>
      <line x1="10" y1="-4" x2="10" y2="-24" stroke="#c9bc94"/><line x1="20" y1="0" x2="20" y2="-20" stroke="#c9bc94"/></g>`,
  fuel: (x, y) => `<g transform="translate(${x} ${y})">
      <path d="M0,0 L0,-30 L6,-36 L28,-36 L28,0 Z" fill="#c8321f"/>
      <rect x="8" y="-33" width="14" height="6" rx="2" fill="#7a1f17"/>
      <path d="M4,-6 L24,-26 M4,-26 L24,-6" stroke="#9b2617" stroke-width="2"/></g>`,
  weapon: (x, y) => `<g transform="translate(${x} ${y}) rotate(-12)">
      <path d="M-3,0 L3,0 L6,-74 Q6,-82 0,-82 Q-6,-82 -6,-74 Z" fill="#c49a5a"/>
      <rect x="-3.5" y="-12" width="7" height="12" fill="#3b2a1a"/></g>`,
};

/** 같은 물건을 count개(최대 max개) 늘어놓고, 수량 꼬리표를 붙인다. */
/**
 * 같은 물건을 늘어놓고 수량 꼬리표를 붙인다.
 * 통조림·물은 '¼캔' 단위라 캔·병 수로 그리고, 딴 캔(남은 양이 4번이 안 되는 것)은 반쯤 비어 보이게 한다.
 */
function group(key, x, y, count, { max, step, label = true }) {
  if (count <= 0) return '';
  const portions = RESOURCES[key].portions;
  const units = portions ? Math.ceil(count / SERVINGS) : count;
  const opened = portions ? count % SERVINGS : 0;
  const shown = Math.min(units, max);
  let out = '';
  for (let i = 0; i < shown; i++) {
    const partial = opened && i === shown - 1 && units <= max;
    const art = icon[key](x + i * step, y);
    out += partial
      ? `<g class="opened" data-left="${opened}" opacity="${(0.35 + (0.65 * opened) / SERVINGS).toFixed(2)}">${art}</g>`
      : art;
  }
  if (label) {
    const text = portions || key === 'med' ? formatAmount(key, count) : `${RESOURCES[key].name} ${count}`;
    out += `<text class="shelter-count" x="${x}" y="${y + 14}">${esc(text)}</text>`;
  }
  return out;
}

function shelves(stock) {
  const top = 118;
  const bottom = 196;
  let out = `
    <rect x="24" y="36" width="10" height="${FLOOR - 36}" fill="#5b4330"/>
    <rect x="338" y="36" width="10" height="${FLOOR - 36}" fill="#5b4330"/>
    <rect x="20" y="${top}" width="332" height="8" fill="#7a5a3a"/>
    <rect x="20" y="${bottom}" width="332" height="8" fill="#7a5a3a"/>`;
  out += group('food', 42, top, stock.food, { max: 6, step: 18 });
  out += group('water', 160, top, stock.water, { max: 6, step: 15 });
  out += group('med', 258, top, stock.med, { max: 2, step: 31 });
  out += group('radio', 42, bottom, stock.radio, { max: 1, step: 0 });
  out += group('battery', 92, bottom, stock.battery, { max: 4, step: 12 });
  out += group('flare', 150, bottom, stock.flare, { max: 3, step: 10 });
  out += group('toolkit', 196, bottom, stock.toolkit, { max: 1, step: 0 });
  out += group('map', 262, bottom, stock.map, { max: 1, step: 0 });
  out += group('fuel', 44, FLOOR, stock.fuel, { max: 3, step: 34 });
  out += group('weapon', 368, FLOOR, stock.weapon, { max: 1, step: 0, label: false });
  const empty = ['food', 'water', 'med', 'radio', 'battery', 'flare', 'toolkit', 'map'].every((k) => stock[k] <= 0);
  if (empty) out += `<text class="shelter-empty" x="186" y="${top - 20}" text-anchor="middle">텅 빈 선반</text>`;
  return out;
}

// ── 사람 ──────────────────────────────────────

function hair(id) {
  switch (id) {
    case 'me':
      return `<path d="M-17,-112 Q-16,-130 0,-131 Q16,-130 17,-112 Z" fill="#2f6fb0"/><rect x="-2" y="-118" width="24" height="5" rx="2" fill="#2f6fb0"/>`;
    case 'dad':
      return `<path d="M-16,-110 Q-16,-127 0,-127 Q16,-127 16,-110 Q8,-120 -16,-110 Z" fill="#3b2e25"/><rect x="-7" y="-99" width="14" height="3" rx="1.5" fill="#3b2e25"/>`;
    case 'mom':
      return `<path d="M-19,-86 Q-22,-128 0,-128 Q22,-128 19,-86 L12,-92 Q15,-114 0,-118 Q-15,-114 -12,-92 Z" fill="#6b4226"/>`;
    case 'sis':
      return `<path d="M-16,-110 Q-15,-127 0,-127 Q15,-127 16,-110 Q2,-122 -16,-110 Z" fill="#2a2018"/><circle cx="19" cy="-118" r="7" fill="#2a2018"/>`;
    default:
      return '';
  }
}

function figure(p, mood) {
  const mouth =
    mood === 'bad'
      ? '<path d="M-5,-99 Q0,-103 5,-99" fill="none" stroke="#6b3a2a" stroke-width="1.8"/>'
      : mood === 'warn'
        ? '<line x1="-5" y1="-100" x2="5" y2="-100" stroke="#6b3a2a" stroke-width="1.8"/>'
        : '<path d="M-5,-101 Q0,-96 5,-101" fill="none" stroke="#6b3a2a" stroke-width="1.8"/>';
  const bandage =
    p.health >= 1
      ? '<g transform="rotate(-8)"><rect x="-17" y="-121" width="34" height="7" rx="2" fill="#f4f4f4"/><circle cx="8" cy="-117.5" r="2.4" fill="#d8392f"/></g>'
      : '';
  return `
    <rect x="-11" y="-44" width="9" height="44" rx="3" fill="#2b2f36"/>
    <rect x="2" y="-44" width="9" height="44" rx="3" fill="#2b2f36"/>
    <rect x="-24" y="-88" width="8" height="38" rx="4" fill="${p.color}" opacity=".85"/>
    <rect x="16" y="-88" width="8" height="38" rx="4" fill="${p.color}" opacity=".85"/>
    <rect x="-17" y="-92" width="34" height="52" rx="10" fill="${p.color}"/>
    <circle cx="0" cy="-108" r="16" fill="#f1c9a0"/>
    ${hair(p.id)}
    <circle cx="-5.5" cy="-109" r="1.9" fill="#222"/>
    <circle cx="5.5" cy="-109" r="1.9" fill="#222"/>
    ${mouth}
    ${bandage}`;
}

function needBubble(p) {
  const hungry = p.hunger >= HUNGER_NOTICE;
  const thirsty = p.thirst >= THIRST_NOTICE;
  if (!hungry && !thirsty) return '';
  const danger = p.hunger >= HUNGER_WEAK || p.thirst >= THIRST_WEAK;
  const icons = [];
  if (thirsty) icons.push('<path d="M0,-11 Q7,-2 4,4 Q0,8 -4,4 Q-7,-2 0,-11 Z" fill="#4aa3df"/>');
  if (hungry) icons.push('<g><rect x="-6" y="-8" width="12" height="15" rx="1.5" fill="#b8c0c8"/><rect x="-6" y="-4" width="12" height="6" fill="#c4512f"/></g>');
  const w = 18 + icons.length * 18;
  const inner = icons.map((svg, i) => `<g transform="translate(${-w / 2 + 18 + i * 18} 0)">${svg}</g>`).join('');
  return `<g class="bubble ${danger ? 'danger' : ''}" transform="translate(30 -142)">
      <rect x="${-w / 2}" y="-16" width="${w}" height="28" rx="12" fill="${danger ? '#4a1d1a' : '#f5efe3'}" stroke="${danger ? '#ff6b5e' : '#d7cdb8'}" stroke-width="2"/>
      <path d="M-10,11 L-18,22 L-2,12 Z" fill="${danger ? '#4a1d1a' : '#f5efe3'}"/>
      ${inner}</g>`;
}

function person(p, x, index) {
  const critical = p.health >= 2;
  const weak = p.hunger >= HUNGER_WEAK || p.thirst >= THIRST_WEAK;
  const mood = critical || weak ? 'bad' : p.health >= 1 || p.hunger >= HUNGER_NOTICE || p.thirst >= THIRST_NOTICE ? 'warn' : 'ok';
  const label = `<text class="shelter-name" x="0" y="22" text-anchor="middle">${esc(p.name)}</text>`;
  if (critical) {
    // 중상: 매트에 누워 있다
    return `<g class="shelter-person critical" data-person="${p.id}" transform="translate(${x} ${FLOOR})">
        <rect x="-52" y="-12" width="104" height="12" rx="4" fill="#6c7a89"/>
        <g transform="translate(46 -16) rotate(-90) scale(.8)">${figure(p, mood)}</g>
        ${label}</g>`;
  }
  return `<g class="shelter-person ${weak ? 'weak' : ''}" data-person="${p.id}" transform="translate(${x} ${FLOOR})">
      <ellipse cx="0" cy="0" rx="24" ry="5" fill="rgba(0,0,0,.35)"/>
      <g class="bob" style="animation-delay:${(index * 0.45).toFixed(2)}s">${figure(p, mood)}${needBubble(p)}</g>
      ${label}</g>`;
}

// ── 보리와 감자 화분 ─────────────────────────────

function dog(x) {
  return `<g class="shelter-dog" data-pet="dog" transform="translate(${x} ${FLOOR})">
      <ellipse cx="0" cy="0" rx="26" ry="4" fill="rgba(0,0,0,.35)"/>
      <path class="tail" d="M-22,-22 Q-34,-34 -28,-44" fill="none" stroke="#c98f4a" stroke-width="5" stroke-linecap="round"/>
      <rect x="-24" y="-28" width="40" height="18" rx="9" fill="#d9a35c"/>
      <rect x="-20" y="-14" width="6" height="14" rx="3" fill="#c98f4a"/>
      <rect x="6" y="-14" width="6" height="14" rx="3" fill="#c98f4a"/>
      <circle cx="18" cy="-32" r="11" fill="#d9a35c"/>
      <path d="M10,-40 L8,-50 L17,-43 Z" fill="#a9743a"/>
      <path d="M22,-42 L27,-50 L28,-40 Z" fill="#a9743a"/>
      <ellipse cx="27" cy="-29" rx="6" ry="4.5" fill="#f1dcc0"/>
      <circle cx="31" cy="-30" r="2" fill="#222"/>
      <circle cx="19" cy="-35" r="1.8" fill="#222"/>
      <text class="shelter-name" x="0" y="22" text-anchor="middle">보리</text></g>`;
}

function planter(stage, yieldCount) {
  const sprouts = stage === 0 ? 2 : Math.min(5, yieldCount);
  let leaves = '';
  for (let i = 0; i < sprouts; i++) {
    const x = sprouts > 1 ? 12 + (i * 56) / (sprouts - 1) : 40;
    const h = stage === 0 ? 8 : 16;
    leaves += `<path d="M${x},-18 q-6,-${h} -1,-${h + 6} M${x},-18 q6,-${h} 1,-${h + 4}" fill="none" stroke="#6fbf5f" stroke-width="3" stroke-linecap="round"/>`;
  }
  // 창턱 위에 올려 둔 스티로폼 화분
  return `<g data-ref="planter" transform="translate(465 130)">
      <rect x="-6" y="0" width="92" height="5" fill="#5b4330"/>
      <rect x="0" y="-18" width="80" height="18" rx="2" fill="#e9e4d8"/>
      <rect x="4" y="-18" width="72" height="5" fill="#5a4330"/>
      ${leaves}</g>`;
}

// ── 방 ────────────────────────────────────────

/** 처음 집: 나무 벽, 판자로 막은 창 */
function houseRoom() {
  return `<rect x="0" y="0" width="960" height="${FLOOR}" fill="#3a3129"/>
      ${Array.from({ length: 20 }, (_, i) => `<rect x="${i * 48 + 20}" y="0" width="2" height="${FLOOR}" fill="#2f2822"/>`).join('')}
      <rect x="0" y="${FLOOR - 8}" width="960" height="8" fill="#2a221b"/>
      <rect x="0" y="${FLOOR}" width="960" height="${300 - FLOOR}" fill="#4b3a29"/>
      ${Array.from({ length: 8 }, (_, i) => `<line x1="${i * 130}" y1="${FLOOR}" x2="${i * 130 - 40}" y2="300" stroke="#3c2e20" stroke-width="2"/>`).join('')}
      <g>
        <rect x="430" y="40" width="150" height="96" fill="#1b2430" stroke="#5b4330" stroke-width="8"/>
        <rect x="422" y="62" width="166" height="14" fill="#8a6a46" transform="rotate(-6 505 69)"/>
        <rect x="422" y="98" width="166" height="14" fill="#8a6a46" transform="rotate(5 505 105)"/>
      </g>`;
}

/** 지하 방공호: 콘크리트 벽, 환기구, 물탱크 */
function bunkerRoom() {
  return `<rect x="0" y="0" width="960" height="${FLOOR}" fill="#3b4045"/>
      ${Array.from({ length: 6 }, (_, i) => `<rect x="0" y="${i * 34 + 10}" width="960" height="2" fill="#33373b"/>`).join('')}
      ${Array.from({ length: 10 }, (_, i) => `<rect x="${i * 100 + (i % 2) * 50}" y="0" width="2" height="${FLOOR}" fill="#34383c"/>`).join('')}
      <rect x="0" y="${FLOOR - 8}" width="960" height="8" fill="#2a2d30"/>
      <rect x="0" y="${FLOOR}" width="960" height="${300 - FLOOR}" fill="#4a4d50"/>
      <g data-ref="vent">
        <rect x="450" y="44" width="110" height="60" rx="4" fill="#2a2e33" stroke="#5c636b" stroke-width="5"/>
        ${Array.from({ length: 5 }, (_, i) => `<rect x="458" y="${54 + i * 10}" width="94" height="4" fill="#5c636b"/>`).join('')}
      </g>
      <g data-ref="tank">
        <rect x="300" y="40" width="70" height="110" rx="10" fill="#516270" stroke="#3a4650" stroke-width="4"/>
        <rect x="330" y="150" width="8" height="18" fill="#3a4650"/>
        <text class="shelter-note" x="335" y="100" text-anchor="middle" fill="#d6dde3">물</text>
      </g>
      <text class="shelter-name" x="505" y="130" text-anchor="middle">방공호</text>`;
}

export function renderShelter(game) {
  const present = game.presentPeople();
  const away = game.people.filter((p) => p.status === 'away');
  const startX = 450;
  const step = present.length > 3 ? 100 : 116;
  const people = present.map((p, i) => person(p, startX + i * step, i)).join('');
  const garden = game.director.chains.garden;
  const gardenActive = garden.opened && !['done', 'failed'].includes(garden.status);
  const pets = game.flags.dog ? dog(812) : '';
  const plants = gardenActive ? planter(garden.stage, 2 + garden.data.care) : '';
  const awayNote = away.length
    ? `<g transform="translate(866 132)"><rect x="0" y="0" width="60" height="40" fill="#efe6cf" transform="rotate(4)"/>
        <text class="shelter-note" x="30" y="17" text-anchor="middle" transform="rotate(4)">${esc(away[0].name)}</text>
        <text class="shelter-note" x="30" y="32" text-anchor="middle" transform="rotate(4)">탐사 중</text></g>`
    : '';
  const items = Object.entries(game.stock)
    .filter(([, n]) => n > 0)
    .map(([k, n]) => `${RESOURCES[k].name} ${n}`)
    .join(', ');
  const bunker = game.flags.shelter === 'bunker';
  const label = `${bunker ? '방공호' : '집'} 안: ${present.map((p) => p.name).join(', ')}${game.flags.dog ? ', 보리(개)' : ''}${away.length ? ` (탐사 중: ${away.map((p) => p.name).join(', ')})` : ''}. 재고: ${items || '없음'}`;
  return `
    <svg class="shelter ${bunker ? 'bunker' : ''}" viewBox="0 0 960 300" role="img" aria-label="${esc(label)}" data-ref="shelter" data-place="${bunker ? 'bunker' : 'house'}">
      ${bunker ? bunkerRoom() : houseRoom()}
      <line x1="700" y1="0" x2="700" y2="44" stroke="#222" stroke-width="2"/>
      <circle class="lamp-glow" cx="700" cy="54" r="40" fill="#ffd77a" opacity=".08"/>
      <circle cx="700" cy="52" r="9" fill="#ffe8a8"/>
      <rect x="852" y="86" width="84" height="${FLOOR - 86}" fill="#5d3b24" stroke="#3a2416" stroke-width="5"/>
      <circle cx="866" cy="180" r="4" fill="#d9b44a"/>
      <rect x="846" y="150" width="96" height="10" fill="#3a2416"/>
      ${awayNote}
      ${shelves(game.stock)}
      ${plants}
      ${people}
      ${pets}
    </svg>`;
}
