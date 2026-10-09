export type User = {
  id: string
  username: string
  name: string
  employeeCode: string
  role: 'admin' | 'leader' | 'employee'
  isActive: boolean
}

export type ChecklistItem = {
  key: string
  title: string
  description: string
  choices: InspectionResult[]
  order: number
  isActive?: boolean
}

export type InspectionResult = 'OK' | 'NG' | 'N/A'

export type Photo = {
  id: string
  type: 'before' | 'after'
  name: string
  uploadedAt: string
  url: string
}

export type InspectionResponse = ChecklistItem & {
  id: string
  result: InspectionResult
  issueDetails: string
  responsible: string
  followUpStatus: string
  dueDate: string
  resolutionNote: string
  photos: Photo[]
}

export type Inspection = {
  id: string
  date: string
  time: string
  inspector: string
  employeeCode: string
  area: string
  shift: string
  createdAt: string
  items: InspectionResponse[]
}

export type InspectionSummary = Omit<Inspection, 'items'> & {
  ngCount: number
  openCount: number
  resolvedCount: number
}

export type Employee = {
  employeeCode: string
  nameTh: string
  nameEn: string
  positionTh: string
  positionEn: string
  departmentTh: string
  departmentEn: string
  createdAt: string
  updatedAt: string
}

export type AssessmentQuestion = {
  id: string
  prompt: string
  type: 'choice' | 'text'
  options: string[]
  correctOption: number | null
  required: boolean
  order: number
}

export type AssessmentQuestionPublic = Omit<AssessmentQuestion, 'correctOption'>

export type Assessment = {
  id: string
  token: string
  title: string
  description: string
  instructions: string
  isPublished: boolean
  allowMultipleAttempts: boolean
  questionCount: number
  submissionCount: number
  questions: AssessmentQuestion[]
  createdAt: string
  updatedAt: string
}

export type AssessmentSubmission = {
  id: string
  employeeCode: string
  employeeName: string
  answers: { questionId: string; prompt: string; type: 'choice' | 'text'; answer: string; isScored: boolean; isCorrect: boolean }[]
  score: number
  maxScore: number
  submittedAt: string
}

export type TrainingMaterial = {
  id: string
  token: string
  title: string
  description: string
  originalName: string
  mimeType: string
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export type PublicEmployeeSuggestion = { employeeCode: string; name: string; nameTh: string; nameEn: string }

export type MyTask = {
  id: string
  inspectionId: string
  date: string
  time: string
  inspector: string
  employeeCode: string
  area: string
  shift: string
  title: string
  description: string
  issueDetails: string
  responsible: string
  followUpStatus: string
  dueDate: string
  beforePhotos: number
  afterPhotos: number
  overdue: boolean
}

export type DashboardData = {
  from: string
  to: string
  stats: {
    inspections: number
    checked: number
    ng: number
    open: number
    resolved: number
    overdue: number
    resolutionRate: number
  }
  categories: { title: string; count: number }[]
  trend: { date: string; ok: number; ng: number; na: number }[]
  recent: InspectionSummary[]
}

export type DashboardCategorySummary = {
  title: string
  from: string
  to: string
  total: number
  recordTotal: number
  counts: { ok: number; ng: number; na: number }
  records: {
    id: string
    date: string
    time: string
    inspector: string
    employeeCode: string
    area: string
    shift: string
    result: InspectionResult
    followUpStatus: string
  }[]
}

export type Filters = {
  from: string
  to: string
  area: string
  inspector: string
  employeeCode: string
  shift: string
  result: string
  status: string
  category: string
}

export type InspectionSuggestions = {
  areas: string[]
  shifts: string[]
  inspectors: string[]
  employeeCodes: string[]
  responsibles: string[]
}
