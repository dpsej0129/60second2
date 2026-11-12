// 게임 밸런스 수치. 규칙을 바꿀 때는 이 파일부터 확인한다.

// ── 80초 탐색(마트 ↔ 집) ────────────────────────
export const RUN_SECONDS = 80; // 처음 물자·가족을 집으로 옮기는 제한 시간. 끝날 때 집 앞에 있어야 산다
export const INVENTORY_SLOTS = 4; // 가방 칸 수(가족도 칸을 차지한다)
export const PICKUP_SECONDS = 0.3; // 물품이든 가족이든 가방에 넣는 데 걸리는 시간
export const PICK_RANGE = 64; // 선반·가족과 이 거리 안에 있어야 집을 수 있다
export const PLAYER_RADIUS = 14;
export const ZOMBIE_RADIUS = 14;
export const PLAYER_SPEED = 150; // px/s
export const WEIGHT_PENALTY_PER_SLOT = 0.04; // 가방 1칸마다 이동 속도 4% 감소
export const INJURY_SPEED_PENALTY = 0.15; // 부상 단계마다 이동 속도 15% 감소
export const SIM_STEP = 1 / 60; // 실시간 구간 고정 시뮬레이션 간격

// ── 집 생존 ─────────────────────────────────────
// 통조림 ¼캔·물 ¼병이 한 사람의 한 끼다. 매일 줄 필요는 없고, 아래 날짜만큼 버틸 수 있다.
export const HUNGER_NOTICE = 3; // 이 이상이면 배고픔: 기본 배급표가 식량을 준다
export const HUNGER_WEAK = 5; // 이 이상이면 굶주림: 사건에서 행동 불가
export const HUNGER_DEATH = 7;
export const THIRST_NOTICE = 2; // 이 이상이면 목마름: 기본 배급표가 물을 준다
export const THIRST_WEAK = 4; // 이 이상이면 탈수: 사건에서 행동 불가
export const THIRST_DEATH = 5;
export const HEALTH_CRITICAL = 2; // 중상: 행동 불가, 헬기 탑승 불가
export const HEALTH_DEATH = 3;
// 치료 없이 부상이 한 단계 악화되는 일수는 난이도(difficulty.js)의 worsenDays 를 따른다.

// ── 탐사(생존 단계에서 한 명을 밖으로 내보내 물자 구해 오기) ──
export const EXPEDITION_CAPACITY = 4; // 탐사자가 들고 올 수 있는 칸 수(난이도에 따라 달라진다)

// ── 마음 상태(가족) ─────────────────────────────
// 0 안정 · 1 지침 · 2 울적함 · 3 우울함(행동 불가) · 4 무너짐(환청·망상, 집을 나갈 수 있다)
export const MOOD_LOW = 2;
export const MOOD_DEPRESSED = 3;
export const MOOD_BROKEN = 4;

// ── 사건 ────────────────────────────────────────
export const CALM_DAYS = 1; // 집에 돌아온 첫날은 사건 없음(조용한 날로 셈)
export const DAILY_EVENT_CHANCE = 0.45; // 예정된 연쇄 사건이 없는 날 무작위 사건 확률(난이도에 따라 달라진다)
export const MAX_QUIET_DAYS = 2; // 사건 없는 날이 이만큼 연속되면 다음 날은 반드시 사건 발생
