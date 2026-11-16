// ===== ตั้งค่าโหมด "ศึกปราบอสูร" (ผู้ชมช่วยกันส่งของขวัญ/กดใจ/พิมพ์ เพื่อกำจัดสัตว์ประหลาด) =====
window.BOSS_CONFIG = {
  title: 'ศึกปราบอสูร',

  // รายชื่ออสูรแต่ละด่าน (ชนะครบแล้ววนกลับด่านแรกแต่เลือดเยอะขึ้นเรื่อย ๆ)
  bosses: [
    { name: 'อสูรหมอกม่วง', color: '#7b3fe4', eye: '#ffe066', horns: 2, eyes: 1 },
    { name: 'ยักษ์ลาวา', color: '#e4532f', eye: '#fff36b', horns: 3, eyes: 2 },
    { name: 'ราชาน้ำแข็ง', color: '#3fb6e4', eye: '#ffffff', horns: 4, eyes: 3 },
    { name: 'เจ้าป่ามรกต', color: '#2fae6a', eye: '#ff6b6b', horns: 2, eyes: 2 },
    { name: 'จอมมารทองคำ', color: '#d9a521', eye: '#ff3b3b', horns: 5, eyes: 3 },
  ],
  baseHp: 15000, // เลือดอสูรด่านแรก
  hpGrowth: 1.5, // ด่านต่อไปเลือดคูณเท่านี้

  // ดาเมจ
  chatDamage: 10, // พิมพ์ "ตี" 1 ครั้ง
  chatCooldownSec: 3,
  likeDamage: 2, // ต่อ 1 หัวใจ
  coinDamage: 20, // ต่อ 1 เหรียญของขวัญ (Rose 1 เหรียญ = 20 ดาเมจ, Rocket 299 = 5,980)

  // ของขวัญ -> ท่าโจมตี (ดูจากราคาต่อชิ้น)
  attackTiers: [
    { min: 1, kind: 'fireball', label: 'ลูกไฟ', icon: '🌹' },
    { min: 5, kind: 'lightning', label: 'สายฟ้า', icon: '🫰' },
    { min: 30, kind: 'meteor', label: 'อุกกาบาต', icon: '🍩' },
    { min: 99, kind: 'sword', label: 'ดาบเทพ', icon: '🫶' },
    { min: 299, kind: 'ultimate', label: 'ลำแสงสุดท้าย', icon: '🚀' },
  ],

  // อสูรสวนกลับ
  bossAttackEverySec: 30, // ทุกกี่วินาที
  bossWindupSec: 4, // เตือนก่อนโจมตี (ให้คนพิมพ์ "กัน" ทัน)
  knockoutCount: 6, // ตีสลบได้ครั้งละกี่คน
  reviveSec: 25, // สลบแล้วฟื้นเองในกี่วินาที
  regenAfterIdleSec: 20, // ไม่มีใครตีนานเท่านี้ อสูรเริ่มฟื้นเลือด
  regenPercentPerSec: 0.5, // ฟื้นกี่ % ต่อวินาที

  // คำสั่งในแชท
  commands: {
    attack: ['ตี', 'โจมตี', 'สู้', 'attack'],
    heal: ['ฮีล', 'ชุบ', 'heal'], // ชุบชีวิตเพื่อนที่สลบ 3 คน
    shield: ['กัน', 'โล่', 'shield'], // กันการโจมตีครั้งถัดไปของอสูร
  },
  healCooldownSec: 10,
  shieldCooldownSec: 15,

  followBuffSec: 30, // มีคนติดตาม = ทั้งทีมดาเมจ x1.5 ชั่วคราว
  maxHeroes: 160,
  spawnOnJoin: true,
  idleLeaveMinutes: 5,
};
