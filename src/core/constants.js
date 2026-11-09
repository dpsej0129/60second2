// 게임 밸런스 수치. 규칙을 바꿀 때는 이 파일부터 확인한다.

// ── 60초 탐색(마트 ↔ 집) ────────────────────────
export const RUN_SECONDS = 60; // 물자·가족을 집으로 옮기는 전체 제한 시간. 끝날 때 집 앞에 있어야 산다
export const INVENTORY_SLOTS = 4; // 가방 칸 수(가족도 칸을 차지한다)
export const PICKUP_SECONDS_PER_SLOT = 0.6; // 큰 물건일수록 집는 데 오래 걸린다
export const PERSON_PICKUP_SECONDS = 1.0; // 가족을 불러 부축하는 데 걸리는 시간
export const PICK_RANGE = 64; // 선반·가족과 이 거리 안에 있어야 집을 수 있다
export const PLAYER_RADIUS = 14;
export const ZOMBIE_RADIUS = 14;
export const PLAYER_SPEED = 150; // px/s
export const WEIGHT_PENALTY_PER_SLOT = 0.04; // 가방 1칸마다 이동 속도 4% 감소
export const INJURY_SPEED_PENALTY = 0.15; // 부상 단계마다 이동 속도 15% 감소
export const SIM_STEP = 1 / 60; // 실시간 구간 고정 시뮬레이션 간격

// ── 집 생존 ─────────────────────────────────────
export const HUNGER_WEAK = 4; // 이 이상이면 굶주림: 사건에서 행동 불가
export const HUNGER_DEATH = 6;
export const THIRST_WEAK = 3; // 이 이상이면 탈수: 사건에서 행동 불가
export const THIRST_DEATH = 4;
export const HEALTH_CRITICAL = 2; // 중상: 행동 불가, 헬기 탑승 불가
export const HEALTH_DEATH = 3;
export const INJURY_WORSEN_DAYS = 3; // 치료 없이 이 일수가 지나면 부상이 한 단계 악화

// ── 탐사(생존 단계에서 한 명을 내보내 물자 구해 오기) ──
export const EXPEDITION_CAPACITY = 4; // 탐사자가 들고 올 수 있는 칸 수
export const EXPEDITION_DAYS = [1, 2]; // 떠난 뒤 며칠 만에 돌아오는지(무작위)

// ── 사건 ────────────────────────────────────────
export const CALM_DAYS = 1; // 집에 돌아온 첫날은 사건 없음(조용한 날로 셈)
export const DAILY_EVENT_CHANCE = 0.4; // 예정된 연쇄 사건이 없는 날 무작위 사건 확률
export const MAX_QUIET_DAYS = 2; // 사건 없는 날이 이만큼 연속되면 다음 날은 반드시 사건 발생
