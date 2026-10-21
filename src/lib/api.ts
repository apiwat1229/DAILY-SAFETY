import type { Assignee, Assessment, AssessmentQuestion, AssessmentReportSubmission, AssessmentSubmission, ChecklistItem, DashboardCategorySummary, DashboardData, Employee, EmployeeActivityReport, Filters, HiyariForm, HiyariLanguage, HiyariSubmission, Inspection, InspectionSummary, InspectionSuggestions, MyTask, PublicEmployeeSuggestion, TrainingMaterial, User } from './types'

type ApiOptions = RequestInit & { body?: BodyInit | null }

async function request<T>(url: string, options: ApiOptions = {}): Promise<T> {
  const response = await fetch(url, { credentials: 'same-origin', ...options })
  const type = response.headers.get('content-type') || ''
  const payload = type.includes('application/json') ? await response.json() : null
  if (!response.ok) throw new Error(payload?.error || 'เชื่อมต่อระบบไม่สำเร็จ')
  return payload as T
}

export const api = {
  me: () => request<{ user: User | null }>('/api/auth/me'),
  login: (username: string, password: string, rememberMe: boolean) => request<{ user: User }>('/api/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password, rememberMe }),
  }),
  logout: () => request<{ ok: boolean }>('/api/auth/logout', { method: 'POST' }),
  dashboard: (filters?: Partial<Filters> & { categoryResult?: 'NG' | 'N/A' }) => request<DashboardData>(`/api/dashboard${toQuery(filters)}`),
  dashboardCategory: (category: string, from: string, to: string, result: 'NG' | 'N/A') => {
    const query = new URLSearchParams({ category, from, to, result })
    return request<DashboardCategorySummary>(`/api/dashboard/category?${query.toString()}`)
  },
  myTasks: () => request<{ tasks: MyTask[]; counts: { total: number; notStarted: number; inProgress: number; overdue: number } }>('/api/my-tasks'),
  assignees: () => request<{ assignees: Assignee[] }>('/api/assignees'),
  checklist: () => request<{ items: ChecklistItem[] }>('/api/checklist'),
  publicInspectionChecklist: () => request<{ items: ChecklistItem[] }>('/api/public/daily-inspection'),
  adminChecklist: () => request<{ items: ChecklistItem[] }>('/api/admin/checklist'),
  createChecklistItem: (input: Pick<ChecklistItem, 'title' | 'description' | 'choices' | 'order'>) => request<{ item: ChecklistItem }>('/api/admin/checklist', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input),
  }),
  updateChecklistItem: (key: string, input: Partial<Pick<ChecklistItem, 'title' | 'description' | 'choices' | 'order' | 'isActive'>>) => request<{ item: ChecklistItem }>(`/api/admin/checklist/${encodeURIComponent(key)}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input),
  }),
  archiveChecklistItem: (key: string) => request<{ ok: boolean }>(`/api/admin/checklist/${encodeURIComponent(key)}`, { method: 'DELETE' }),
  inspections: (filters?: Partial<Filters>) => request<{ inspections: InspectionSummary[] }>(`/api/inspections${toQuery(filters)}`),
  suggestions: (language: 'th' | 'en' = 'th') => request<InspectionSuggestions>(`/api/suggestions?lang=${language}`),
  inspectionEmployees: (language: 'th' | 'en' = 'th') => request<{ employees: PublicEmployeeSuggestion[] }>(`/api/employees/directory?lang=${language}`),
  inspection: (id: string) => request<{ inspection: Inspection }>(`/api/inspections/${id}`),
  createInspection: (body: FormData) => request<{ inspection: Inspection }>('/api/inspections', { method: 'POST', body }),
  createPublicInspection: (body: FormData) => request<{ ok: boolean }>('/api/public/daily-inspections', { method: 'POST', body }),
  updateResponse: (id: string, body: FormData) => request<{ inspection: Inspection }>(`/api/responses/${id}`, { method: 'PATCH', body }),
  users: () => request<{ users: User[] }>('/api/admin/users'),
  createUser: (input: { username: string; name: string; employeeCode: string; password: string; role: User['role'] }) => request<{ user: User }>('/api/admin/users', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input),
  }),
  updateUser: (id: string, input: Pick<User, 'username' | 'name' | 'employeeCode' | 'role'>) => request<{ user: User }>(`/api/admin/users/${encodeURIComponent(id)}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input),
  }),
  deactivateUser: (id: string) => request<{ user: User }>(`/api/admin/users/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  activateUser: (id: string) => request<{ user: User }>(`/api/admin/users/${encodeURIComponent(id)}/status`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ isActive: true }),
  }),
  resetPassword: (id: string, password: string) => request<{ ok: boolean }>(`/api/admin/users/${id}/password`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }),
  }),
  employees: () => request<{ employees: Employee[] }>('/api/admin/employees'),
  createEmployee: (input: Omit<Employee, 'createdAt' | 'updatedAt'>) => request<{ employee: Employee }>('/api/admin/employees', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input),
  }),
  updateEmployee: (code: string, input: Omit<Employee, 'createdAt' | 'updatedAt'>) => request<{ employee: Employee }>(`/api/admin/employees/${encodeURIComponent(code)}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input),
  }),
  deleteEmployee: (code: string) => request<{ ok: boolean }>(`/api/admin/employees/${encodeURIComponent(code)}`, { method: 'DELETE' }),
  employeeReport: (code: string) => request<EmployeeActivityReport>(`/api/admin/employees/${encodeURIComponent(code)}/report`),
  assessments: () => request<{ assessments: Assessment[] }>('/api/admin/assessments'),
  createAssessment: (input: { title: string; description: string; instructions: string; allowMultipleAttempts: boolean; questions: Omit<AssessmentQuestion, 'id' | 'order'>[] }) => request<{ assessment: Assessment }>('/api/admin/assessments', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input),
  }),
  updateAssessment: (id: string, input: { title: string; description: string; instructions: string; isPublished: boolean; allowMultipleAttempts: boolean; questions: AssessmentQuestion[] }) => request<{ assessment: Assessment }>(`/api/admin/assessments/${encodeURIComponent(id)}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input),
  }),
  deleteAssessment: (id: string) => request<{ ok: boolean }>(`/api/admin/assessments/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  assessmentSubmissions: (id: string) => request<{ assessment: Pick<Assessment, 'id' | 'title'>; questions: AssessmentQuestion[]; submissions: AssessmentSubmission[] }>(`/api/admin/assessments/${encodeURIComponent(id)}/submissions`),
  assessmentReportSubmissions: () => request<{ submissions: AssessmentReportSubmission[] }>('/api/admin/assessment-submissions'),
  publicAssessment: (token: string) => request<{ assessment: { title: string; description: string; instructions: string; allowMultipleAttempts: boolean; questions: Omit<AssessmentQuestion, 'correctOption'>[] } }>(`/api/public/assessments/${encodeURIComponent(token)}`),
  submitAssessment: (token: string, input: { employeeCode: string; employeeName: string; answers: Record<string, string> }) => request<{ ok: boolean; score: number; maxScore: number; submittedAt: string }>(`/api/public/assessments/${encodeURIComponent(token)}/submissions`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input),
  }),
  publicEmployeeSuggestions: (query: string, language: 'th' | 'en') => request<{ employees: PublicEmployeeSuggestion[] }>(`/api/public/employees?${new URLSearchParams({ q: query, lang: language })}`),
  hiyariForms: () => request<{ forms: HiyariForm[] }>('/api/admin/hiyari-forms'),
  createHiyariForm: (input: { title: string; description: string }) => request<{ form: HiyariForm }>('/api/admin/hiyari-forms', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input),
  }),
  updateHiyariForm: (id: string, input: Partial<Pick<HiyariForm, 'title' | 'description' | 'isActive'>>) => request<{ form: HiyariForm }>(`/api/admin/hiyari-forms/${encodeURIComponent(id)}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input),
  }),
  deleteHiyariForm: (id: string) => request<{ ok: boolean }>(`/api/admin/hiyari-forms/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  hiyariSubmissions: (formId?: string) => request<{ submissions: HiyariSubmission[] }>(`/api/admin/hiyari-submissions${formId ? `?${new URLSearchParams({ formId })}` : ''}`),
  publicHiyari: (token: string) => request<{ form: { title: string; description: string } }>(`/api/public/hiyari/${encodeURIComponent(token)}`),
  submitHiyari: (token: string, input: { employeeCode: string; employeeName: string; language: HiyariLanguage; reportDate: string; whenText: string; whereText: string; whatHappened: string; suggestions: string; note: string; photos: File[] }) => {
    const body = new FormData()
    for (const [key, value] of Object.entries(input)) {
      if (key === 'photos') for (const photo of value as File[]) body.append('photos', photo)
      else body.append(key, String(value))
    }
    return request<{ ok: boolean; submittedAt: string }>(`/api/public/hiyari/${encodeURIComponent(token)}/submissions`, { method: 'POST', body })
  },
  trainingMaterials: () => request<{ materials: TrainingMaterial[] }>('/api/admin/training-materials'),
  createTrainingMaterial: (body: FormData) => request<{ material: TrainingMaterial }>('/api/admin/training-materials', { method: 'POST', body }),
  updateTrainingMaterial: (id: string, body: FormData) => request<{ material: TrainingMaterial }>(`/api/admin/training-materials/${encodeURIComponent(id)}`, { method: 'PATCH', body }),
  deleteTrainingMaterial: (id: string) => request<{ ok: boolean }>(`/api/admin/training-materials/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  publicTrainingMaterial: (token: string) => request<{ material: TrainingMaterial & { fileUrl: string; presentationUrl: string } }>(`/api/public/training-materials/${encodeURIComponent(token)}`),
  markTrainingViewed: (token: string, input: { employeeCode: string; employeeName: string }) => request<{ ok: boolean; viewedAt: string }>(`/api/public/training-materials/${encodeURIComponent(token)}/views`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input),
  }),
}

export function assessmentExportUrl(id: string) {
  return `/api/admin/assessments/${encodeURIComponent(id)}/export.xlsx`
}

export function assessmentReportExportUrl() {
  return '/api/admin/assessment-submissions/export.xlsx'
}

export function hiyariSubmissionExportUrl(id: string) {
  return `/api/admin/hiyari-submissions/${encodeURIComponent(id)}/export.xlsx`
}

export function hiyariEmployeeSummaryExportUrl(language: 'th' | 'en', from?: string, to?: string) {
  const query = new URLSearchParams({ lang: language })
  if (from) query.set('from', from)
  if (to) query.set('to', to)
  return `/api/admin/hiyari-submissions/export-by-employee.xlsx?${query}`
}

export function publicLink(type: 'assessment' | 'training' | 'hiyari' | 'inspection', token = '', title = '') {
  if (type === 'inspection') return `${window.location.origin}/daily-inspection`
  const route = type === 'assessment' ? 'assessment' : type === 'training' ? 'training' : 'hiyari'
  const fallback = type === 'assessment' ? 'safety-assessment' : type === 'training' ? 'safety-training' : 'hiyari-hat'
  const slug = title.normalize('NFKC').toLocaleLowerCase().trim()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64) || fallback
  return `${window.location.origin}/${route}/${encodeURIComponent(slug)}/${encodeURIComponent(token)}`
}

export function toQuery(filters?: Partial<Filters>) {
  if (!filters) return ''
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(filters)) if (value) query.set(key, value)
  const result = query.toString()
  return result ? `?${result}` : ''
}

export function exportUrl(filters?: Partial<Filters>) {
  return `/api/inspections/export.csv${toQuery(filters)}`
}

export function exportExcelUrl(filters?: Partial<Filters>, language: 'th' | 'en' = 'th') {
  const query = new URLSearchParams(toQuery(filters).slice(1))
  query.set('lang', language)
  return `/api/inspections/export.xlsx?${query.toString()}`
}

export function localDateString(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date)
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${values.year}-${values.month}-${values.day}`
}

export function localTimeString(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(date)
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${values.hour}:${values.minute}`
}

export function formatDate(date: string, language: 'th' | 'en' = 'th') {
  if (!date) return '—'
  return new Intl.DateTimeFormat(language === 'th' ? 'th-TH' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Bangkok' }).format(new Date(`${date}T12:00:00+07:00`))
}

export function formatDateTime(date: string, language: 'th' | 'en' = 'th', includeTimezone = true) {
  if (!date) return '—'
  const formatted = new Intl.DateTimeFormat(language === 'th' ? 'th-TH' : 'en-GB', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    hourCycle: 'h23', timeZone: 'Asia/Bangkok',
  }).format(new Date(date))
  return includeTimezone ? `${formatted} (Bangkok, UTC+07:00)` : formatted
}
