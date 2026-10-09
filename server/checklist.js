export const CHECKLIST = [
  { key: 'ppe', title: 'PPE', description: 'พนักงานสวม PPE ถูกต้องและครบถ้วน' },
  { key: 'ppe-care', title: 'ความสะอาดของ PPE', description: 'มีการทำความสะอาดและจัดเก็บอย่างถูกต้องเหมาะสม' },
  { key: 'safe-behavior', title: 'พฤติกรรมเสี่ยง', description: 'พนักงานมีพฤติกรรมที่ปลอดภัยและปฏิบัติตามกฎระเบียบบริษัท' },
  { key: 'walkway', title: 'ทางเดิน', description: 'ไม่มีสิ่งกีดขวาง น้ำขัง หรือเศษยาง และการจอดรถไม่กีดขวางทางเดิน' },
  { key: 'machinery', title: 'เครื่องจักร', description: 'การ์ดป้องกันเครื่องจักรอยู่ในสภาพปลอดภัย' },
  { key: 'forklift', title: 'รถตัก / รถยก', description: 'ปฏิบัติตามกฎความปลอดภัย และตรวจเช็กรถก่อนใช้งาน' },
  { key: 'storage', title: 'การจัดเก็บ', description: 'จัดเรียงวัสดุอย่างมั่นคง ไม่เสี่ยงต่อการโค่นล้ม และวางในพื้นที่กำหนด' },
  { key: 'electrical', title: 'ไฟฟ้า', description: 'ไม่มีสายไฟชำรุดหรืออุปกรณ์ไฟฟ้าผิดปกติ' },
  { key: 'fire', title: 'อัคคีภัย', description: 'ถังดับเพลิงและทางหนีไฟไม่ถูกกีดขวาง' },
  { key: 'smoking', title: 'การสูบบุหรี่', description: 'มีการสูบบุหรี่เฉพาะในพื้นที่ที่กำหนด' },
  { key: 'chemicals', title: 'สารเคมี', description: 'ไม่มีการหกรั่วไหล มี SDS และภาชนะจัดเก็บไม่ชำรุด' },
  { key: 'high-risk-work', title: 'งานเสี่ยง', description: 'มีมาตรการป้องกันเหมาะสมกับงานเสี่ยง เช่น งานบนที่สูงหรืองานในที่อับอากาศ' },
  { key: 'near-miss', title: 'Near Miss', description: 'มีการแจ้งและติดตามอันตรายที่พบ' },
].map((item, index) => ({ ...item, order: index + 1 }))

export const RESULTS = ['OK', 'NG', 'N/A']
export const FOLLOW_UP_STATUSES = ['ยังไม่แก้ไข', 'กำลังแก้ไข', 'แก้ไขแล้ว']
