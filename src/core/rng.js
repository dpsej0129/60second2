// 시드 기반 난수. 같은 시드면 같은 사건 배치가 나오므로 재현·테스트가 가능하다.

export function hashSeed(...parts) {
  let h = 2166136261 >>> 0;
  for (const part of parts) {
    const s = String(part);
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    h ^= 0x9e3779b9;
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export class Rng {
  constructor(seed) {
    this.seed = seed >>> 0;
    this.state = this.seed || 0x12345678;
  }

  // mulberry32
  next() {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  float(min = 0, max = 1) {
    return min + (max - min) * this.next();
  }

  /** min 이상 max 이하 정수 */
  int(min, max) {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  chance(p) {
    return this.next() < p;
  }

  pick(list) {
    return list[Math.floor(this.next() * list.length)];
  }

  /** 섞은 새 배열 (Fisher–Yates) */
  shuffle(list) {
    const out = [...list];
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }

  weighted(list, weightOf) {
    const total = list.reduce((sum, item) => sum + weightOf(item), 0);
    let r = this.next() * total;
    for (const item of list) {
      r -= weightOf(item);
      if (r < 0) return item;
    }
    return list[list.length - 1];
  }

  fork(label) {
    return new Rng(hashSeed(this.seed, label));
  }
}

export function randomSeed() {
  return 100000 + Math.floor(Math.random() * 900000);
}
