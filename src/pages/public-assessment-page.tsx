import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { AlertCircle, CheckCircle2, ClipboardCheck, LoaderCircle, UserRound } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import type { AssessmentQuestionPublic, PublicEmployeeSuggestion } from '@/lib/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { translateTo, useI18n } from '@/lib/i18n'

type PublicAssessment = { title: string; description: string; instructions: string; allowMultipleAttempts: boolean; questions: AssessmentQuestionPublic[] }
type AssessmentLanguage = 'th' | 'en' | 'my'

const safetyBasicsTitle = 'แบบประเมินความรู้ความปลอดภัยพื้นฐาน'
const safetyBasicsTranslations: Record<'en' | 'my', { title: string; description: string; instructions: string; questions: { prompt: string; options: string[] }[] }> = {
  en: {
    title: 'Basic Safety Knowledge Assessment',
    description: 'Review knowledge about PPE, machinery, chemicals, material handling, and emergencies.',
    instructions: 'Choose the single best answer. This assessment has 18 questions and may be submitted once per employee ID.',
    questions: [
      { prompt: 'A cut-resistant glove is torn before work begins. What should you do?', options: ['Keep using it until the end of the shift', 'Replace it with an intact glove before starting work', 'Cover the tear with tape', 'Remove the glove and continue working'] },
      { prompt: 'What should you do first before cleaning a machine that still has energy?', options: ['Quickly wipe only the reachable areas', 'Stop the machine, isolate and lock out energy, attach a tag, and verify isolation', 'Ask a coworker to stand by the stop button', 'Put on thicker gloves and begin'] },
      { prompt: 'You notice a loose machine guard while the machine is running. What should you do?', options: ['Stop the machine and notify the responsible person', 'Push the guard back into place by hand', 'Continue carefully', 'Remove the guard to stop it vibrating'] },
      { prompt: 'You find a chemical container without a label. What should you do?', options: ['Smell it to identify the chemical', 'Pour it into a similar chemical', 'Stop using it, isolate the area, and notify a supervisor so it can be identified safely', 'Leave the cap open so the smell can fade'] },
      { prompt: 'What should you do if a chemical splashes into your eye?', options: ['Rub your eye and return to work', 'Flush your eye immediately at an eyewash station and get help', 'Wipe it with a dry cloth', 'Wait for the irritation to go away'] },
      { prompt: 'There is an uncleaned oil spill in a walkway. What should you do?', options: ['Walk around it without telling anyone', 'Warn or barricade the area, notify the responsible person, and arrange safe cleanup', 'Spread paper over it and walk across', 'Wait for it to dry'] },
      { prompt: 'What should you do before manually lifting a heavy load?', options: ['Assess its weight and route; use lifting equipment or ask for help when needed', 'Bend your back and lift as quickly as possible', 'Twist your body while lifting to save time', 'Hold the load away from your body'] },
      { prompt: 'How should pedestrians behave near a forklift?', options: ['Cross in front of it so the driver can see you', 'Use marked walkways or crossings and wait until the driver acknowledges you', 'Walk behind it while it is reversing', 'Stand beneath a raised load'] },
      { prompt: 'Which is the correct basic way to use a fire extinguisher?', options: ['Pull the pin, aim at the base of the fire, squeeze the handle, and sweep the nozzle', 'Aim at the top of the flames and spray continuously', 'Shake the extinguisher and leave the cap open', 'Get as close to the fire as possible before spraying'] },
      { prompt: 'What should you do first if someone receives an electric shock?', options: ['Grab and pull the person away immediately', 'Cut off the power without touching the person and call the response team', 'Pour water on them to revive them', 'Use a metal object to move the wire'] },
      { prompt: 'What should be done before starting welding work?', options: ['Start immediately if you have a welding mask', 'Obtain a hot-work permit, remove combustibles, and prepare an extinguisher and fire watch', 'Only open a door', 'Ask a coworker to watch from a distance without preparing equipment'] },
      { prompt: 'What is required before entering a confined space for work?', options: ['One coworker standing near the entrance', 'A permit, atmosphere testing, an attendant, and a rescue plan', 'An ordinary cloth mask', 'Finishing the work within five minutes'] },
      { prompt: 'A near miss occurs but no one is injured. What should you do?', options: ['Do not report it because nothing was damaged', 'Report it to a supervisor so the cause can be corrected and recurrence prevented', 'Tell coworkers after the shift', 'Wait for it to happen again'] },
      { prompt: 'After locking and tagging energy sources, what must be done before repairs?', options: ['Verify that the machine cannot start and no stored energy remains', 'Remove the tag so it is easy to see', 'Leave the key with a coworker and start repairs', 'Try turning the parts by hand'] },
      { prompt: 'How should you work in a noisy area?', options: ['Wear earplugs or earmuffs required for the area', 'Turn up the radio to cover the machine noise', 'Remove hearing protection from time to time', 'Stay away from the noise without informing a supervisor'] },
      { prompt: 'Where should cloths contaminated with chemicals be disposed of?', options: ['A general waste bin', 'The designated, labeled hazardous-waste container', 'A drain', 'Beside the machine'] },
      { prompt: 'You smell smoke and an alarm sounds. What should you do?', options: ['Collect your personal belongings first', 'Evacuate by the designated route to the assembly point and await instructions', 'Take the elevator downstairs', 'Return to investigate the source yourself'] },
      { prompt: 'What should you do if you are unsure how to work or notice an unsafe condition?', options: ['Stop work and ask a supervisor before continuing', 'Try it slowly', 'Copy what you have seen without asking', 'Leave it for a coworker to handle'] },
    ],
  },
  my: {
    title: 'အခြေခံ ဘေးကင်းရေး အသိပညာ စစ်ဆေးမှု',
    description: 'ကိုယ်ရေးကာကွယ်ရေးပစ္စည်း၊ စက်ယန္တရား၊ ဓာတုပစ္စည်း၊ ပစ္စည်းရွှေ့ပြောင်းခြင်းနှင့် အရေးပေါ်အခြေအနေများကို ပြန်လည်လေ့လာပါ။',
    instructions: 'အကောင်းဆုံးအဖြေတစ်ခုကိုသာ ရွေးပါ။ မေးခွန်း ၁၈ ခုရှိပြီး ဝန်ထမ်းအမှတ်တစ်ခုလျှင် တစ်ကြိမ်သာ ပေးပို့နိုင်သည်။',
    questions: [
      { prompt: 'အလုပ်မစမီ ဖြတ်ရှဒဏ်ကာ လက်အိတ် စုတ်ပြဲနေပါက ဘာလုပ်သင့်သလဲ။', options: ['အလုပ်ချိန်ကုန်သည်အထိ ဆက်သုံးပါ', 'အလုပ်မစမီ ကောင်းမွန်သော လက်အိတ်ဖြင့် လဲလှယ်ပါ', 'စုတ်ပြဲသည့်နေရာကို တိပ်ဖြင့်ကပ်ပါ', 'လက်အိတ်ချွတ်ပြီး ဆက်လုပ်ပါ'] },
      { prompt: 'စွမ်းအင်ရှိနေသေးသော စက်ကို သန့်ရှင်းရေးမလုပ်မီ ပထမဆုံး ဘာလုပ်သင့်သလဲ။', options: ['လက်လှမ်းမီသည့်နေရာကိုသာ အမြန်သုတ်ပါ', 'စက်ရပ်၊ စွမ်းအင်ဖြတ်၊ လော့ခ်နှင့် သတိပေးတံဆိပ်တပ်ပြီး သီးခြားထားမှုကို စစ်ဆေးပါ', 'ရပ်ခလုတ်အနီးတွင် လုပ်ဖော်ကိုင်ဖက်ကို စောင့်ခိုင်းပါ', 'ပိုထူသော လက်အိတ်ဝတ်ပြီး စတင်ပါ'] },
      { prompt: 'စက်လည်နေစဉ် အကာအကွယ်အဖုံး လျော့နေသည်ကို တွေ့ပါက ဘာလုပ်သင့်သလဲ။', options: ['စက်ရပ်ပြီး တာဝန်ရှိသူကို အသိပေးပါ', 'လက်ဖြင့် အဖုံးကို ပြန်တွန်းတပ်ပါ', 'ပိုမိုသတိထားပြီး ဆက်လုပ်ပါ', 'တုန်ခါမှုမဖြစ်စေရန် အဖုံးကို ဖြုတ်ပါ'] },
      { prompt: 'တံဆိပ်မပါသော ဓာတုပစ္စည်းဘူးကို တွေ့ပါက ဘာလုပ်သင့်သလဲ။', options: ['အနံ့ခံ၍ ဓာတုပစ္စည်းကို ခွဲခြားပါ', 'ဆင်တူသော ဓာတုပစ္စည်းထဲသို့ လောင်းထည့်ပါ', 'အသုံးပြုမှုရပ်၊ နေရာကို ခွဲထားပြီး ကြီးကြပ်သူထံ အန္တရာယ်ကင်းစွာ ခွဲခြားရန် အသိပေးပါ', 'အနံ့ပျောက်စေရန် အဖုံးဖွင့်ထားပါ'] },
      { prompt: 'ဓာတုပစ္စည်း မျက်လုံးထဲစင်ပါက ဘာလုပ်သင့်သလဲ။', options: ['မျက်လုံးကို ပွတ်ပြီး အလုပ်ပြန်လုပ်ပါ', 'မျက်လုံးဆေးကန်တွင် ချက်ချင်းဆေးကြောပြီး အကူအညီတောင်းပါ', 'ခြောက်သောအဝတ်ဖြင့် သုတ်ပါ', 'ယားယံမှု ပျောက်သည်အထိ စောင့်ပါ'] },
      { prompt: 'လမ်းလျှောက်လမ်းတွင် မသန့်ရှင်းရသေးသော ဆီယိုဖိတ်မှုရှိပါက ဘာလုပ်သင့်သလဲ။', options: ['မည်သူ့ကိုမျှ မပြောဘဲ လှည့်ပတ်သွားပါ', 'နေရာကို သတိပေး သို့မဟုတ် ကာရံ၊ တာဝန်ရှိသူကို အသိပေးပြီး လုံခြုံစွာ သန့်ရှင်းစေပါ', 'စက္ကူဖြန့်ပြီး ဖြတ်လျှောက်ပါ', 'ခြောက်သွားသည်အထိ စောင့်ပါ'] },
      { prompt: 'လေးလံသောပစ္စည်းကို လက်ဖြင့်မမီမီ ဘာလုပ်သင့်သလဲ။', options: ['အလေးချိန်နှင့် သယ်ယူလမ်းကြောင်းကို စစ်ဆေးပြီး လိုအပ်ပါက ကိရိယာသုံး သို့မဟုတ် အကူအညီတောင်းပါ', 'ခါးကုန်းပြီး အမြန်မပါ', 'အချိန်ကုန်သက်သာရန် ကိုယ်ကိုလှည့်၍ မပါ', 'ပစ္စည်းကို ကိုယ်နှင့်ဝေးဝေးထားပါ'] },
      { prompt: 'ဖော့ကလစ်ကားအနီးတွင် လမ်းလျှောက်သူများ ဘယ်လိုနေထိုင်သင့်သလဲ။', options: ['မောင်းသူမြင်စေရန် ကားရှေ့မှ ဖြတ်ပါ', 'သတ်မှတ်ထားသော လမ်း သို့မဟုတ် ကူးမျဉ်းကိုသုံးပြီး မောင်းသူသိရှိကြောင်း စောင့်ပါ', 'နောက်ဆုတ်နေသော ကားနောက်မှ လျှောက်ပါ', 'မြှောက်ထားသောဝန်အောက်တွင် ရပ်ပါ'] },
      { prompt: 'မီးသတ်ဆေးဘူးကို အခြေခံမှန်ကန်စွာ ဘယ်လိုအသုံးပြုသလဲ။', options: ['ပင်ဖြုတ်၊ မီးအောက်ခြေကို ချိန်၊ လက်ကိုင်ညှစ်ပြီး ခေါင်းကို ဘေးတိုက်ရွှေ့ဖျန်းပါ', 'မီးတောက်ထိပ်ကိုချိန်၍ ဆက်တိုက်ဖျန်းပါ', 'ဘူးကိုလှုပ်ပြီး အဖုံးဖွင့်ထားပါ', 'မဖျန်းမီ မီးအနီးဆုံးသို့ သွားပါ'] },
      { prompt: 'လျှပ်စစ်ဓာတ်လိုက်သူကို တွေ့ပါက ပထမဆုံး ဘာလုပ်သင့်သလဲ။', options: ['လူကိုချက်ချင်းဆွဲထုတ်ပါ', 'လူကိုမထိဘဲ လျှပ်စစ်ကိုဖြတ်ပြီး ကူညီရေးအဖွဲ့ကို ခေါ်ပါ', 'သတိပြန်ရစေရန် ရေလောင်းပါ', 'သတ္တုပစ္စည်းဖြင့် ဝါယာကြိုးကို တွန်းပါ'] },
      { prompt: 'ဂဟေဆော်ခြင်းမစမီ ဘာလုပ်ရမည်နည်း။', options: ['ဂဟေမျက်နှာဖုံးရှိလျှင် ချက်ချင်းစတင်ပါ', 'အပူအလုပ်ခွင့်ပြုချက်ရယူ၊ မီးလောင်လွယ်ပစ္စည်းဖယ်ရှား၊ မီးသတ်ဆေးဘူးနှင့် မီးစောင့်ပြင်ဆင်ပါ', 'တံခါးတစ်ခုပဲ ဖွင့်ထားပါ', 'ပစ္စည်းမပြင်ဆင်ဘဲ အဝေးမှကြည့်ရန် လုပ်ဖော်ကိုင်ဖက်ကို ခေါ်ပါ'] },
      { prompt: 'ကန့်သတ်နေရာသို့ အလုပ်ဝင်မီ ဘာတွေလိုအပ်သလဲ။', options: ['ဝင်ပေါက်အနီးတွင် လုပ်ဖော်ကိုင်ဖက်တစ်ဦး ရှိခြင်း', 'ခွင့်ပြုချက်၊ လေထုစစ်ဆေးမှု၊ စောင့်ကြည့်သူနှင့် ကယ်ဆယ်ရေးအစီအစဉ်', 'သာမန်အဝတ်နှာခေါင်းစည်း', 'ငါးမိနစ်အတွင်း အလုပ်ပြီးစီးခြင်း'] },
      { prompt: 'မတော်တဆမှုဖြစ်လုနီးပါး ဖြစ်သော်လည်း ထိခိုက်သူမရှိပါက ဘာလုပ်သင့်သလဲ။', options: ['ပျက်စီးမှုမရှိသဖြင့် မတင်ပြပါနှင့်', 'အကြောင်းရင်းပြင်ဆင်၍ ထပ်မဖြစ်စေရန် ကြီးကြပ်သူထံ တင်ပြပါ', 'အလုပ်ပြီးမှ လုပ်ဖော်ကိုင်ဖက်များကို ပြောပါ', 'ထပ်ဖြစ်သည်အထိ စောင့်ပါ'] },
      { prompt: 'စွမ်းအင်ကို လော့ခ်ချပြီး သတိပေးတံဆိပ်တပ်ပြီးနောက် ပြုပြင်မီ ဘာလုပ်ရမည်နည်း။', options: ['စက်မစတင်နိုင်ကြောင်းနှင့် ကျန်စွမ်းအင်မရှိကြောင်း အတည်ပြုပါ', 'မြင်ရလွယ်စေရန် တံဆိပ်ကိုဖြုတ်ပါ', 'သော့ကို လုပ်ဖော်ကိုင်ဖက်ထံထားပြီး ပြုပြင်ပါ', 'အစိတ်အပိုင်းများကို လက်ဖြင့်လှည့်စမ်းပါ'] },
      { prompt: 'ဆူညံသောနေရာတွင် အလုပ်လုပ်ပါက ဘာလုပ်သင့်သလဲ။', options: ['နေရာစည်းမျဉ်းအရ နားပိတ် သို့မဟုတ် နားကာကို ဝတ်ပါ', 'စက်သံဖုံးရန် ရေဒီယိုအသံတိုးပါ', 'ခဏခဏ နားကာချွတ်ပါ', 'ကြီးကြပ်သူမပြောဘဲ အသံဆူရာနှင့် ဝေးဝေးနေပါ'] },
      { prompt: 'ဓာတုပစ္စည်းပေကျံသော အဝတ်စများကို ဘယ်မှာစွန့်ပစ်သင့်သလဲ။', options: ['အမှိုက်ပုံးသာမန်', 'သတ်မှတ်ပြီး တံဆိပ်ကပ်ထားသော အန္တရာယ်ရှိစွန့်ပစ်ပစ္စည်းပုံး', 'ရေမြောင်း', 'စက်ဘေးတွင်ထားပါ'] },
      { prompt: 'မီးခိုးနံ့ရပြီး အချက်ပေးသံမြည်ပါက ဘာလုပ်သင့်သလဲ။', options: ['ကိုယ်ပိုင်ပစ္စည်းများကို အရင်ယူပါ', 'သတ်မှတ်လမ်းကြောင်းဖြင့် စုဝေးရာနေရာသို့ ထွက်ခွာပြီး ညွှန်ကြားချက်ကို စောင့်ပါ', 'ဓာတ်လှေကားဖြင့် အောက်ဆင်းပါ', 'အကြောင်းရင်းကို ကိုယ်တိုင်စစ်ရန် ပြန်သွားပါ'] },
      { prompt: 'အလုပ်လုပ်ပုံ မသေချာပါက သို့မဟုတ် မလုံခြုံသောအခြေအနေတွေ့ပါက ဘာလုပ်သင့်သလဲ။', options: ['အလုပ်ရပ်ပြီး ဆက်မလုပ်မီ ကြီးကြပ်သူကို မေးပါ', 'ဖြည်းဖြည်းစမ်းလုပ်ပါ', 'မမေးဘဲ မြင်ဖူးသည့်အတိုင်း လုပ်ပါ', 'လုပ်ဖော်ကိုင်ဖက်ကို တာဝန်ပေးပါ'] },
    ],
  },
}

const assessmentUiMy: Record<string, string> = {
  'แบบประเมิน': 'စစ်ဆေးမှု', 'กำลังโหลดข้อมูล…': 'အချက်အလက်များ ဖွင့်နေသည်…', 'ไม่พบแบบประเมิน': 'စစ်ဆေးမှုကို မတွေ့ပါ',
  'กำลังค้นหา…': 'ရှာဖွေနေသည်…', 'ข้อคำถาม': 'မေးခွန်းများ', 'ส่งคำตอบเรียบร้อยแล้ว': 'အဖြေ ပေးပို့ပြီးပါပြီ', 'ขอบคุณที่ทำแบบประเมิน': 'စစ်ဆေးမှုကို ဖြေဆိုပေးသည့်အတွက် ကျေးဇူးတင်ပါသည်',
  'ข้อมูลผู้ทำแบบประเมิน': 'ဖြေဆိုသူ အချက်အလက်', 'คะแนน': 'ရမှတ်', 'คำแนะนำ': 'ညွှန်ကြားချက်များ', 'ชื่อพนักงาน': 'ဝန်ထမ်းအမည်',
  'ตรวจสอบข้อมูลก่อนส่งคำตอบ': 'မပေးပို့မီ အချက်အလက်များကို စစ်ဆေးပါ', 'แบบประเมินออนไลน์': 'အွန်လိုင်းစစ်ဆေးမှု', 'พิมพ์คำตอบ': 'အဖြေကို ရိုက်ထည့်ပါ',
  'พิมพ์ชื่อเพื่อค้นหา': 'ရှာရန် အမည်ရိုက်ထည့်ပါ', 'พิมพ์รหัสเพื่อค้นหา': 'ရှာရန် ဝန်ထမ်းအမှတ်ရိုက်ထည့်ပါ', 'รหัสพนักงาน': 'ဝန်ထမ်းအမှတ်',
  'ระบบความปลอดภัยประจำวัน': 'နေ့စဉ် ဘေးကင်းလုံခြုံရေးစနစ်', 'รายชื่อพนักงาน': 'ဝန်ထမ်းစာရင်း', 'เลือกชื่อหรือรหัสจากรายการ ระบบจะเติมอีกช่องให้อัตโนมัติ': 'စာရင်းမှ အမည် သို့မဟုတ် ဝန်ထမ်းအမှတ်ကို ရွေးပါ။ ကျန်အကွက်ကို အလိုအလျောက် ဖြည့်ပေးပါမည်။',
  'ส่งคำตอบ': 'အဖြေပေးပို့ရန်', 'ภาษา': 'ဘာသာစကား', 'กรุณาตอบคำถามให้ครบทุกข้อ': 'မေးခွန်းအားလုံးကို ဖြေဆိုပါ။', 'กรุณาเลือกชื่อและรหัสพนักงานจากรายการทะเบียน': 'ဝန်ထမ်းစာရင်းမှ အမည်နှင့် ဝန်ထမ်းအမှတ်ကို ရွေးပါ။',
  'ไม่พบแบบประเมินหรือปิดรับคำตอบแล้ว': 'စစ်ဆေးမှုကို မတွေ့ပါ သို့မဟုတ် အဖြေလက်ခံမှု ပိတ်ထားပါသည်။',
  'ส่งคำตอบไม่สำเร็จ': 'အဖြေပေးပို့၍ မရပါ။', 'กรุณากรอกชื่อและรหัสพนักงาน': 'ဝန်ထမ်းအမည်နှင့် အမှတ်ကို ဖြည့်ပါ။', 'ชื่อและรหัสพนักงานไม่ตรงกับฐานข้อมูล': 'အမည်နှင့် ဝန်ထမ်းအမှတ် မကိုက်ညီပါ။',
}

function translatedSampleAssessment(assessment: PublicAssessment, language: AssessmentLanguage) {
  if (assessment.title !== safetyBasicsTitle || language === 'th') return assessment
  const content = safetyBasicsTranslations[language]
  return {
    ...assessment,
    title: content.title,
    description: content.description,
    instructions: content.instructions,
    questions: assessment.questions.map((question, index) => ({ ...question, prompt: content.questions[index]?.prompt || question.prompt, options: content.questions[index]?.options || question.options })),
  }
}

export function PublicAssessmentPage({ token }: { token: string }) {
  const { language: defaultLanguage } = useI18n()
  const [language, setLanguage] = useState<AssessmentLanguage>(() => {
    const saved = localStorage.getItem('assessment-language')
    return saved === 'th' || saved === 'en' || saved === 'my' ? saved : defaultLanguage
  })
  const t = (thai: string) => language === 'my' ? assessmentUiMy[thai] || thai : translateTo(language, thai)
  const [assessment, setAssessment] = useState<PublicAssessment | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [employeeName, setEmployeeName] = useState('')
  const [employeeCode, setEmployeeCode] = useState('')
  const [selectedEmployeeCode, setSelectedEmployeeCode] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [suggestions, setSuggestions] = useState<PublicEmployeeSuggestion[]>([])
  const [suggesting, setSuggesting] = useState(false)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<{ score: number; maxScore: number } | null>(null)
  const [attempted, setAttempted] = useState(false)
  const [highlightedQuestionId, setHighlightedQuestionId] = useState('')
  const displayAssessment = assessment ? translatedSampleAssessment(assessment, language) : null

  useEffect(() => {
    let current = true
    api.publicAssessment(token).then(({ assessment: row }) => { if (current) setAssessment(row) })
      .catch((error) => { if (current) setLoadError(error instanceof Error ? error.message : 'ไม่พบแบบประเมินหรือปิดรับคำตอบแล้ว') })
      .finally(() => { if (current) setLoading(false) })
    return () => { current = false }
  }, [token])

  useEffect(() => {
    const query = searchTerm.trim()
    if (query.length < 2) { setSuggestions([]); setSuggesting(false); return }
    let current = true
    const timer = window.setTimeout(() => {
      setSuggesting(true)
      api.publicEmployeeSuggestions(query, language === 'th' ? 'th' : 'en').then(({ employees }) => { if (current) setSuggestions(employees) })
        .catch(() => { if (current) setSuggestions([]) })
        .finally(() => { if (current) setSuggesting(false) })
    }, 220)
    return () => { current = false; window.clearTimeout(timer) }
  }, [searchTerm, language])

  function changeLanguage(next: AssessmentLanguage) {
    setLanguage(next)
    localStorage.setItem('assessment-language', next)
  }

  function chooseEmployee(employee: PublicEmployeeSuggestion) {
    setEmployeeName(employee.name)
    setEmployeeCode(employee.employeeCode)
    setSelectedEmployeeCode(employee.employeeCode)
    setSearchTerm('')
    setSuggestions([])
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!assessment || submitting) return
    setAttempted(true)
    if (!employeeName.trim() || !employeeCode.trim() || selectedEmployeeCode !== employeeCode.trim().toUpperCase()) {
      document.getElementById('participant-details')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      toast.error(t('กรุณาเลือกชื่อและรหัสพนักงานจากรายการทะเบียน'))
      return
    }
    const missing = assessment.questions.find((question) => question.required && !answers[question.id]?.trim())
    if (missing) {
      setHighlightedQuestionId(missing.id)
      window.requestAnimationFrame(() => document.querySelector(`[data-question-id="${CSS.escape(missing.id)}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }))
      toast.error(t('กรุณาตอบคำถามให้ครบทุกข้อ'))
      return
    }
    setHighlightedQuestionId('')
    setSubmitting(true)
    try {
      const response = await api.submitAssessment(token, { employeeName: employeeName.trim(), employeeCode: employeeCode.trim(), answers })
      setResult({ score: response.score, maxScore: response.maxScore })
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (error) {
      toast.error(t(error instanceof Error ? error.message : 'ส่งคำตอบไม่สำเร็จ'))
    } finally { setSubmitting(false) }
  }

  return <PublicPageFrame language={language} onLanguageChange={changeLanguage} t={t}>
    <div className="mx-auto w-full max-w-3xl space-y-5">
      <Card className="overflow-hidden rounded-2xl border-border shadow-sm">
        <CardHeader className="bg-white p-5 sm:p-7">
          <div className="mb-2 flex items-center gap-3"><div className="grid size-11 place-items-center rounded-xl bg-secondary text-primary"><ClipboardCheck size={22} /></div><Badge variant="outline" className="border-primary/20 bg-white text-primary">{t('แบบประเมิน')}</Badge></div>
          <CardTitle as="h1" className="page-heading text-2xl leading-tight sm:text-3xl">{displayAssessment?.title || (loading ? t('กำลังโหลดข้อมูล…') : t('ไม่พบแบบประเมิน'))}</CardTitle>
          {displayAssessment?.description && <CardDescription className="text-base">{displayAssessment.description}</CardDescription>}
        </CardHeader>
        {loading ? <CardContent className="flex items-center gap-2 border-t p-6 text-muted-foreground"><LoaderCircle size={18} className="animate-spin" />{t('กำลังโหลดข้อมูล…')}</CardContent>
          : loadError ? <CardContent className="flex items-start gap-3 border-t p-5 text-destructive"><AlertCircle className="mt-0.5 shrink-0" size={19} /><p>{t(loadError)}</p></CardContent>
            : result ? <CardContent className="border-t p-5 sm:p-7"><div className="rounded-2xl border border-success/25 bg-success/10 p-5 text-center"><CheckCircle2 className="mx-auto size-10 text-success" /><h2 className="mt-3 text-xl font-semibold text-success">{t('ส่งคำตอบเรียบร้อยแล้ว')}</h2><p className="mt-1 text-muted-foreground">{t('ขอบคุณที่ทำแบบประเมิน')}</p>{result.maxScore > 0 && <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 font-semibold text-primary">{t('คะแนน')}: {result.score} / {result.maxScore}</div>}</div></CardContent>
            : displayAssessment && <form noValidate onSubmit={submit} className="space-y-5 border-t p-4 sm:p-7">
                {displayAssessment.instructions && <div className="rounded-xl border border-info/20 bg-info/10 p-4"><p className="font-semibold text-info">{t('คำแนะนำ')}</p><p className="mt-1 whitespace-pre-wrap text-sm text-info/80">{displayAssessment.instructions}</p></div>}
                <section id="participant-details" className="space-y-4 rounded-xl border p-4 sm:p-5">
                  <div className="flex items-center gap-2 font-semibold"><UserRound size={18} className="text-primary" />{t('ข้อมูลผู้ทำแบบประเมิน')}</div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="relative grid gap-1.5"><Label htmlFor="assessment-employee-name">{t('ชื่อพนักงาน')} *</Label><Input id="assessment-employee-name" aria-invalid={attempted && (!employeeName.trim() || selectedEmployeeCode !== employeeCode.trim().toUpperCase())} value={employeeName} autoComplete="off" onChange={(event) => { setEmployeeName(event.target.value); setSelectedEmployeeCode(''); setSearchTerm(event.target.value) }} placeholder={t('พิมพ์ชื่อเพื่อค้นหา')} maxLength={160} className="h-12" /></div>
                    <div className="grid gap-1.5"><Label htmlFor="assessment-employee-code">{t('รหัสพนักงาน')} *</Label><Input id="assessment-employee-code" aria-invalid={attempted && (!employeeCode.trim() || selectedEmployeeCode !== employeeCode.trim().toUpperCase())} value={employeeCode} autoComplete="off" onChange={(event) => { setEmployeeCode(event.target.value); setSelectedEmployeeCode(''); setSearchTerm(event.target.value) }} placeholder={t('พิมพ์รหัสเพื่อค้นหา')} maxLength={80} className="h-12 uppercase" /></div>
                  </div>
                  {(suggestions.length > 0 || suggesting) && <div className="max-h-56 overflow-y-auto rounded-xl border bg-white shadow-sm" role="listbox" aria-label={t('รายชื่อพนักงาน')}>
                    {suggesting && <div className="p-3 text-sm text-muted-foreground">{t('กำลังค้นหา…')}</div>}
                    {suggestions.map((employee) => <button key={employee.employeeCode} type="button" role="option" aria-selected="false" onClick={() => chooseEmployee(employee)} className="flex w-full items-center justify-between gap-3 border-b px-3 py-3 text-left last:border-0 hover:bg-secondary/50"><span className="font-medium">{employee.name}</span><span className="shrink-0 text-sm text-muted-foreground">{employee.employeeCode}</span></button>)}
                  </div>}
                  <p className="text-sm text-muted-foreground">{t('เลือกชื่อหรือรหัสจากรายการ ระบบจะเติมอีกช่องให้อัตโนมัติ')}</p>
                </section>
                <section className="space-y-4">
                  <h2 className="text-lg font-semibold">{t('ข้อคำถาม')} <span className="text-sm font-normal text-muted-foreground">({displayAssessment.questions.length})</span></h2>
                  {displayAssessment.questions.map((question, index) => <article key={question.id} data-question-id={question.id} className={`space-y-4 rounded-xl border bg-white p-4 transition-colors sm:p-5 ${highlightedQuestionId === question.id ? 'border-destructive/50 bg-destructive/10 ring-2 ring-destructive/20' : ''}`}>
                    <div className="flex items-start gap-3"><Badge variant="outline" className="mt-0.5 shrink-0">{index + 1}</Badge><h3 className="font-semibold leading-relaxed">{question.prompt}{question.required && <span className="ml-1 text-destructive">*</span>}</h3></div>
                    {question.type === 'choice' ? <div className="space-y-2 pl-1 sm:pl-10">{question.options.map((option, optionIndex) => <label key={`${question.id}-${optionIndex}`} className="flex min-h-12 cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 hover:border-primary/50 hover:bg-secondary/50"><input type="radio" name={`question-${question.id}`} value={assessment?.questions[index]?.options[optionIndex] ?? option} checked={answers[question.id] === (assessment?.questions[index]?.options[optionIndex] ?? option)} onChange={() => { setAnswers((current) => ({ ...current, [question.id]: assessment?.questions[index]?.options[optionIndex] ?? option })); if (highlightedQuestionId === question.id) setHighlightedQuestionId('') }} className="size-4 accent-primary" /><span>{option}</span></label>)}</div>
                      : <Textarea value={answers[question.id] || ''} onChange={(event) => { setAnswers((current) => ({ ...current, [question.id]: event.target.value })); if (highlightedQuestionId === question.id && event.target.value.trim()) setHighlightedQuestionId('') }} rows={3} maxLength={5000} placeholder={t('พิมพ์คำตอบ')} />}
                  </article>)}
                </section>
                <div className="flex flex-col-reverse justify-between gap-3 border-t pt-4 sm:flex-row sm:items-center"><p className="text-sm text-muted-foreground">{t('ตรวจสอบข้อมูลก่อนส่งคำตอบ')}</p><Button type="submit" disabled={submitting} className="h-12 w-full gap-2 sm:w-auto">{submitting && <LoaderCircle size={17} className="animate-spin" />}{t('ส่งคำตอบ')}</Button></div>
              </form>}
      </Card>
      <p className="text-center text-sm text-muted-foreground">Y.T. RUBBER · {t('แบบประเมินออนไลน์')}</p>
    </div>
  </PublicPageFrame>
}

function PublicPageFrame({ children, language, onLanguageChange, t }: { children: ReactNode; language: AssessmentLanguage; onLanguageChange: (language: AssessmentLanguage) => void; t: (thai: string) => string }) {
  const options: { code: AssessmentLanguage; label: string }[] = [{ code: 'th', label: 'ไทย' }, { code: 'en', label: 'English' }, { code: 'my', label: 'မြန်မာ' }]
  const languageLabel = language === 'my' ? 'ဘာသာစကား' : language === 'en' ? 'Language' : 'ภาษา'
  return <div lang={language === 'my' ? 'my' : language} className="min-h-dvh bg-background text-foreground"><header className="sticky top-0 z-10 border-b bg-white/95 backdrop-blur"><div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4 sm:px-6"><div className="flex items-center gap-2.5"><div className="grid size-9 place-items-center rounded-lg bg-secondary text-primary"><ClipboardCheck size={18} /></div><div><p className="text-sm font-semibold tracking-wide">Y.T. RUBBER</p><p className="text-xs text-muted-foreground">{t('ระบบความปลอดภัยประจำวัน')}</p></div></div><div className="flex items-center gap-1 rounded-xl border bg-surface-subtle p-1" aria-label={languageLabel}>{options.map((option) => <button key={option.code} type="button" aria-pressed={language === option.code} onClick={() => onLanguageChange(option.code)} className={`min-h-9 rounded-lg px-2.5 text-xs font-medium sm:px-3 ${language === option.code ? 'bg-white text-primary shadow-sm ring-1 ring-black/5' : 'text-muted-foreground hover:text-foreground'}`}>{option.label}</button>)}</div></div></header><main className="mx-auto flex max-w-5xl justify-center px-3 py-5 sm:px-6 sm:py-8">{children}</main></div>
}
