// ===== ตั้งค่างาน (แก้ไฟล์นี้ได้เลย ไม่ต้องแตะโค้ดฉาก) =====
window.LK_CONFIG = {
  title: 'ลอยกระทงออนไลน์',
  subtitle: 'พิมพ์ "ลอย + คำอธิษฐาน" ตัวละครของคุณจะเดินไปลอยกระทง',

  // คำสั่งในแชท (ถ้าข้อความมีคำเหล่านี้)
  commands: {
    float: ['ลอย', 'loy'],
    dance: ['รำ', 'เต้น', 'dance'],
    pray: ['ไหว้', 'สาธุ', 'อธิษฐาน'],
    ride: ['ชิงช้า', 'ชิงช้าสวรรค์', 'ride'],
    lantern: ['โคม', 'ปล่อยโคม'],
  },
  // พิมพ์ตัวเลขเพื่อเลือกชุด
  outfits: [
    { name: 'ชุดไทยชมพู', dress: '#e85d9a', sash: '#ffd36b' },
    { name: 'ชุดไทยเขียว', dress: '#2f9e6f', sash: '#ffcf5a' },
    { name: 'ชุดไทยทอง', dress: '#c9902c', sash: '#fff1b8' },
    { name: 'ชุดไทยม่วง', dress: '#8a4fd1', sash: '#ffc8f0' },
    { name: 'ชุดไทยฟ้า', dress: '#3b82d6', sash: '#ffe08a' },
    { name: 'ชุดไทยแดง', dress: '#d23b3b', sash: '#ffd36b' },
  ],

  // ของขวัญ -> กระทงพิเศษ (เลือกตามจำนวนเพชรต่อชิ้น ขั้นที่สูงสุดที่ถึง)
  giftTiers: [
    { min: 1, kind: 'lotus', label: 'กระทงบัวชมพู', icon: '🌹' },
    { min: 5, kind: 'rainbow', label: 'กระทงดอกไม้รุ้ง', icon: '💐' },
    { min: 30, kind: 'gold', label: 'กระทงทอง', icon: '👑' },
    { min: 99, kind: 'swan', label: 'กระทงหงส์', icon: '🦢' },
    { min: 299, kind: 'boat', label: 'เรือหงส์ทอง', icon: '🚀', spotlight: true },
  ],
  maxKrathongPerGift: 6, // ส่งรัว x10 จะลอยสูงสุดกี่ใบ

  // เป้าหัวใจ: ครบแล้วพลุ + ปล่อยโคมเต็มฟ้า แล้วเพิ่มเป้ารอบถัดไป
  heartGoal: 5000,
  heartGoalStep: 5000,

  // รอบลอยพร้อมกัน (ทุกคนในงานลอยกระทงพร้อมกัน)
  roundEveryMinutes: 5,
  roundCountdownSeconds: 30,

  freeFloatCooldownSec: 15, // คนเดียวลอยฟรีได้ทุกกี่วินาที
  lanternCooldownSec: 30,
  spawnOnJoin: true, // คนเข้าห้องแล้วเดินเข้างานเลย (ไลฟ์คนเยอะมากอาจปิด)
  maxCharacters: 160,
  idleLeaveMinutes: 5, // ไม่พิมพ์/ไม่กดใจนานเท่านี้ ตัวละครจะเดินออก

  // คำต้องห้าม: ถ้าคำอธิษฐานมีคำเหล่านี้จะไม่แสดงข้อความ
  blockedWords: ['ควย', 'เหี้ย', 'สัส', 'เย็ด', 'fuck'],
  wishMaxLength: 40,
  defaultWishes: ['ขอให้สุขภาพแข็งแรง 🙏', 'ขอให้รวย ๆ', 'ขอให้รักกันนาน ๆ 💕', 'ขอให้สอบผ่านทุกวิชา ✌️', 'ขอให้ครอบครัวมีความสุข', 'ขอให้งานปัง'],
};
