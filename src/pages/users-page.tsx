import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Eye, EyeOff, KeyRound, LoaderCircle, Pencil, ShieldCheck, UserCheck, UserPlus, UserRoundX, UsersRound } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import type { User } from '@/lib/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useI18n } from '@/lib/i18n'
import { AutocompleteInput } from '@/components/autocomplete-input'

export function UsersPage({ currentUser, onCurrentUserUpdate }: { currentUser: User; onCurrentUserUpdate: (user: User) => void }) {
  const { t } = useI18n()
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [createOpen, setCreateOpen] = useState(false)
  const [editingUser, setEditingUser] = useState<User | null>(null)
  const [deactivatingUser, setDeactivatingUser] = useState<User | null>(null)
  const [resetUser, setResetUser] = useState<User | null>(null)
  const refresh = useCallback(() => {
    setLoading(true)
    api.users().then(({ users: result }) => setUsers(result)).catch((error) => toast.error(error.message)).finally(() => setLoading(false))
  }, [])
  useEffect(refresh, [refresh])

  async function activateUser(user: User) {
    try {
      const { user: updated } = await api.activateUser(user.id)
      toast.success(t('เปิดใช้งานบัญชีผู้ใช้แล้ว'))
      refresh()
      if (updated.id === currentUser.id) onCurrentUserUpdate(updated)
    } catch (error) { toast.error(t(error instanceof Error ? error.message : 'บันทึกไม่สำเร็จ')) }
  }

  function handleUserUpdated(updated: User) {
    refresh()
    if (updated.id === currentUser.id) onCurrentUserUpdate(updated)
  }

  return <div className="space-y-5">
    <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
      <div><p className="text-sm font-medium text-primary">{t('สิทธิ์การใช้งาน')}</p><h1 className="mt-1 text-2xl font-semibold tracking-tight">{t('ผู้ใช้งาน')}</h1><p className="mt-1 text-sm text-muted-foreground">{t('จัดการบัญชีหัวหน้างานและผู้ดูแลระบบ')}</p></div>
      <Button onClick={() => setCreateOpen(true)} className="gap-2 self-start sm:self-auto"><UserPlus size={16} /> {t('เพิ่มผู้ใช้งาน')}</Button>
    </div>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <UserMetric label={t('บัญชีทั้งหมด')} value={users.length} icon={UsersRound} />
      <UserMetric label={t('หัวหน้างาน')} value={users.filter((user) => user.role === 'leader').length} icon={UsersRound} />
      <UserMetric label={t('พนักงาน')} value={users.filter((user) => user.role === 'employee').length} icon={UsersRound} />
      <UserMetric label={t('ผู้ดูแลระบบ')} value={users.filter((user) => user.role === 'admin').length} icon={ShieldCheck} />
    </div>
    <Card className="overflow-hidden rounded-2xl border-[#e8eeee]">
      <CardHeader className="border-b border-[#edf0f0] px-5 py-4"><CardTitle className="text-sm">{t('บัญชีในระบบ')}</CardTitle><CardDescription className="text-[11px]">{t('บัญชีที่ปิดใช้งานจะเข้าสู่ระบบไม่ได้ แต่ประวัติการตรวจยังคงอยู่')}</CardDescription></CardHeader>
      {users.length ? <div className="overflow-x-auto"><Table><TableHeader><TableRow className="bg-[#fafcfc] hover:bg-[#fafcfc]"><TableHead className="min-w-40 pl-5 text-[10px]">{t('ชื่อผู้ใช้งาน')}</TableHead><TableHead className="min-w-32 text-[10px]">{t('ชื่อบัญชี')}</TableHead><TableHead className="min-w-32 text-[10px]">{t('รหัสพนักงาน')}</TableHead><TableHead className="min-w-24 text-[10px]">{t('สิทธิ์')}</TableHead><TableHead className="min-w-28 text-[10px]">{t('สถานะบัญชี')}</TableHead><TableHead className="min-w-[340px] pr-5 text-right text-[10px]">{t('จัดการ')}</TableHead></TableRow></TableHeader>
      <TableBody>{users.map((user) => <TableRow key={user.id} data-inactive={!user.isActive || undefined}><TableCell className="pl-5 text-sm font-medium">{user.name}</TableCell><TableCell className="text-sm text-muted-foreground">{user.username}</TableCell><TableCell className="text-sm text-muted-foreground">{user.employeeCode}</TableCell><TableCell><Badge variant="outline" className={user.role === 'admin' ? 'border-[#cce2dc] bg-[#eef7f4] text-xs text-[#176358]' : 'border-[#e4e9e8] bg-[#f7f9f9] text-xs text-muted-foreground'}>{user.role === 'admin' ? 'Admin' : t(user.role === 'leader' ? 'หัวหน้างาน' : 'พนักงาน')}</Badge></TableCell><TableCell><Badge variant="outline" className={user.isActive ? 'border-emerald-200 bg-emerald-50 text-xs text-emerald-700' : 'border-slate-200 bg-slate-100 text-xs text-slate-600'}>{t(user.isActive ? 'ใช้งาน' : 'ปิดใช้งานแล้ว')}</Badge></TableCell><TableCell className="pr-5"><div className="flex flex-wrap justify-end gap-1.5"><Button variant="outline" size="sm" onClick={() => setEditingUser(user)} className="h-9 gap-1.5 text-xs"><Pencil size={14} /> {t('แก้ไข')}</Button>{user.isActive && <Button variant="outline" size="sm" onClick={() => setResetUser(user)} className="h-9 gap-1.5 text-xs"><KeyRound size={14} /> {t('ตั้งรหัสผ่านใหม่')}</Button>}{user.isActive ? <Button variant="outline" size="sm" onClick={() => setDeactivatingUser(user)} className="h-9 gap-1.5 text-xs text-destructive hover:text-destructive"><UserRoundX size={14} /> {t('ปิดใช้งาน')}</Button> : <Button variant="outline" size="sm" onClick={() => activateUser(user)} className="h-9 gap-1.5 text-xs text-emerald-700 hover:text-emerald-800"><UserCheck size={14} /> {t('เปิดใช้งานบัญชี')}</Button>}</div></TableCell></TableRow>)}</TableBody>
      </Table></div> : <CardContent className="grid min-h-48 place-items-center text-center"><div><p className="text-sm font-medium">{loading ? t('กำลังโหลดบัญชี…') : t('ไม่พบผู้ใช้งาน')}</p><p className="mt-1 text-xs text-muted-foreground">{t('เพิ่มบัญชีเพื่อเริ่มให้หัวหน้างานใช้งานระบบ')}</p></div></CardContent>}
    </Card>
    <CreateUserDialog open={createOpen} onOpenChange={setCreateOpen} onCreated={refresh} />
    <EditUserDialog user={editingUser} onOpenChange={(open) => !open && setEditingUser(null)} onUpdated={handleUserUpdated} />
    <DeactivateUserDialog user={deactivatingUser} onOpenChange={(open) => !open && setDeactivatingUser(null)} onDeactivated={refresh} />
    <ResetPasswordDialog user={resetUser} onOpenChange={(open) => !open && setResetUser(null)} />
  </div>
}

function UserMetric({ label, value, icon: Icon }: { label: string; value: number; icon: typeof UsersRound }) {
  return <Card className="rounded-xl border-[#e8eeee]"><CardContent className="flex items-center justify-between p-4"><div><p className="text-[11px] text-muted-foreground">{label}</p><p className="mt-1 text-2xl font-semibold">{value}</p></div><div className="grid size-9 place-items-center rounded-xl bg-[#edf5f3] text-primary"><Icon size={17} /></div></CardContent></Card>
}

function CreateUserDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (open: boolean) => void; onCreated: () => void }) {
  const { language, t } = useI18n()
  const [busy, setBusy] = useState(false)
  const [role, setRole] = useState<User['role']>('leader')
  const [newName, setNewName] = useState('')
  const [newEmployeeCode, setNewEmployeeCode] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [suggestions, setSuggestions] = useState({ inspectors: [] as string[], employeeCodes: [] as string[] })
  useEffect(() => { if (open) api.suggestions(language).then(setSuggestions).catch(() => undefined) }, [open, language])
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formElement = event.currentTarget
    const form = new FormData(formElement)
    if (password.length < 6) return toast.error(t('รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร'))
    if (password !== confirmPassword) return toast.error(t('รหัสผ่านไม่ตรงกัน'))
    setBusy(true)
    try {
      await api.createUser({
        username: String(form.get('username') || ''),
        name: String(form.get('name') || ''),
        employeeCode: String(form.get('employeeCode') || ''),
        password,
        role,
      })
      toast.success(t('เพิ่มบัญชีผู้ใช้งานแล้ว'))
      onCreated()
      onOpenChange(false)
      formElement.reset()
      setNewName('')
      setNewEmployeeCode('')
      setPassword('')
      setConfirmPassword('')
      setRole('leader')
    } catch (error) { toast.error(t(error instanceof Error ? error.message : 'เพิ่มบัญชีไม่สำเร็จ')) }
    finally { setBusy(false) }
  }
  function close() {
    setPassword('')
    setConfirmPassword('')
    setNewName('')
    setNewEmployeeCode('')
    setRole('leader')
    onOpenChange(false)
  }
  return <Dialog open={open} onOpenChange={(next) => { if (!next) close(); else onOpenChange(true) }}><DialogContent className="max-w-md">
    <DialogHeader><div className="mb-1 grid size-9 place-items-center rounded-xl bg-[#edf5f3] text-primary"><UserPlus size={17} /></div><DialogTitle className="text-base">{t('เพิ่มผู้ใช้งาน')}</DialogTitle><DialogDescription className="text-xs">{t('สร้างบัญชีเพื่อให้หัวหน้างานกรอกแบบตรวจหรือให้ Admin จัดการรายงาน')}</DialogDescription></DialogHeader>
    <form onSubmit={create} className="space-y-3.5 pt-1">
      <div className="grid gap-1.5"><Label htmlFor="new-name">{t('ชื่อผู้ใช้งาน')}</Label><AutocompleteInput id="new-name" name="name" required placeholder={t('ชื่อและนามสกุล')} value={newName} onValueChange={setNewName} suggestions={suggestions.inspectors} /></div>
      <div className="grid gap-1.5"><Label htmlFor="new-code">{t('รหัสพนักงาน')}</Label><AutocompleteInput id="new-code" name="employeeCode" required placeholder={t('เช่น YT-0123')} value={newEmployeeCode} onValueChange={setNewEmployeeCode} suggestions={suggestions.employeeCodes} /></div>
      <div className="grid gap-1.5"><Label htmlFor="new-username">{t('ชื่อบัญชี')}</Label><Input id="new-username" name="username" required minLength={3} maxLength={32} autoComplete="off" placeholder={t('a-z, 0-9, จุด หรือขีด')} /></div>
      <PasswordInput id="new-password" label={t('รหัสผ่านเริ่มต้น')} value={password} onChange={setPassword} placeholder={t('อย่างน้อย 6 ตัวอักษร')} />
      <div className="grid gap-1.5"><PasswordInput id="new-password-confirm" label={t('ยืนยันรหัสผ่าน')} value={confirmPassword} onChange={setConfirmPassword} placeholder={t('กรอกรหัสผ่านอีกครั้ง')} invalid={Boolean(confirmPassword) && password !== confirmPassword} />{Boolean(confirmPassword) && password !== confirmPassword && <p className="text-xs text-destructive" role="alert">{t('รหัสผ่านไม่ตรงกัน')}</p>}</div>
      <div className="grid gap-1.5"><Label htmlFor="new-role">{t('สิทธิ์การใช้งาน')}</Label><Select value={role} onValueChange={(value) => setRole(value as User['role'])}><SelectTrigger id="new-role" className="h-10 w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="employee">{t('พนักงาน')}</SelectItem><SelectItem value="leader">{t('หัวหน้างาน')}</SelectItem><SelectItem value="admin">Admin</SelectItem></SelectContent></Select></div>
      <div className="flex justify-end gap-2 pt-1"><Button type="button" variant="outline" onClick={close}>{t('ยกเลิก')}</Button><Button type="submit" disabled={busy} className="gap-2">{busy && <LoaderCircle size={14} className="animate-spin" />} {t('เพิ่มบัญชี')}</Button></div>
    </form>
  </DialogContent></Dialog>
}

function EditUserDialog({ user, onOpenChange, onUpdated }: { user: User | null; onOpenChange: (open: boolean) => void; onUpdated: (user: User) => void }) {
  const { language, t } = useI18n()
  const [busy, setBusy] = useState(false)
  const [role, setRole] = useState<User['role']>('leader')
  const [username, setUsername] = useState('')
  const [name, setName] = useState('')
  const [employeeCode, setEmployeeCode] = useState('')
  const [suggestions, setSuggestions] = useState({ inspectors: [] as string[], employeeCodes: [] as string[] })

  useEffect(() => {
    if (!user) return
    setUsername(user.username)
    setName(user.name)
    setEmployeeCode(user.employeeCode)
    setRole(user.role)
    api.suggestions(language).then(setSuggestions).catch(() => undefined)
  }, [user, language])

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!user) return
    setBusy(true)
    try {
      const { user: updated } = await api.updateUser(user.id, { username, name, employeeCode, role })
      toast.success(t('แก้ไขบัญชีผู้ใช้แล้ว'))
      onUpdated(updated)
      onOpenChange(false)
    } catch (error) { toast.error(t(error instanceof Error ? error.message : 'บันทึกไม่สำเร็จ')) }
    finally { setBusy(false) }
  }

  return <Dialog open={Boolean(user)} onOpenChange={onOpenChange}><DialogContent className="max-w-md">
    <DialogHeader><div className="mb-1 grid size-9 place-items-center rounded-xl bg-[#edf5f3] text-primary"><Pencil size={17} /></div><DialogTitle className="text-base">{t('แก้ไขบัญชีผู้ใช้')}</DialogTitle><DialogDescription className="text-xs">{t('แก้ไขชื่อบัญชี ข้อมูลพนักงาน และสิทธิ์การใช้งาน')}</DialogDescription></DialogHeader>
    <form onSubmit={save} className="space-y-3.5 pt-1">
      <div className="grid gap-1.5"><Label htmlFor="edit-username">{t('ชื่อบัญชี')}</Label><Input id="edit-username" value={username} onChange={(event) => setUsername(event.target.value)} required minLength={3} maxLength={32} autoComplete="off" placeholder={t('a-z, 0-9, จุด หรือขีด')} /></div>
      <div className="grid gap-1.5"><Label htmlFor="edit-name">{t('ชื่อผู้ใช้งาน')}</Label><AutocompleteInput id="edit-name" value={name} onValueChange={setName} suggestions={suggestions.inspectors} required placeholder={t('ชื่อและนามสกุล')} /></div>
      <div className="grid gap-1.5"><Label htmlFor="edit-code">{t('รหัสพนักงาน')}</Label><AutocompleteInput id="edit-code" value={employeeCode} onValueChange={setEmployeeCode} suggestions={suggestions.employeeCodes} required placeholder={t('เช่น YT-0123')} /></div>
      <div className="grid gap-1.5"><Label htmlFor="edit-role">{t('สิทธิ์การใช้งาน')}</Label><Select value={role} onValueChange={(value) => setRole(value as User['role'])}><SelectTrigger id="edit-role" className="h-10 w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="employee">{t('พนักงาน')}</SelectItem><SelectItem value="leader">{t('หัวหน้างาน')}</SelectItem><SelectItem value="admin">Admin</SelectItem></SelectContent></Select></div>
      <div className="flex justify-end gap-2 pt-1"><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{t('ยกเลิก')}</Button><Button type="submit" disabled={busy} className="gap-2">{busy && <LoaderCircle size={14} className="animate-spin" />} {t('บันทึก')}</Button></div>
    </form>
  </DialogContent></Dialog>
}

function DeactivateUserDialog({ user, onOpenChange, onDeactivated }: { user: User | null; onOpenChange: (open: boolean) => void; onDeactivated: () => void }) {
  const { t } = useI18n()
  const [busy, setBusy] = useState(false)

  async function deactivate() {
    if (!user) return
    setBusy(true)
    try {
      await api.deactivateUser(user.id)
      toast.success(t('ปิดใช้งานบัญชีผู้ใช้แล้ว'))
      onDeactivated()
      onOpenChange(false)
    } catch (error) { toast.error(t(error instanceof Error ? error.message : 'บันทึกไม่สำเร็จ')) }
    finally { setBusy(false) }
  }

  return <Dialog open={Boolean(user)} onOpenChange={onOpenChange}><DialogContent className="max-w-sm">
    <DialogHeader><div className="mb-1 grid size-9 place-items-center rounded-xl bg-red-50 text-destructive"><UserRoundX size={17} /></div><DialogTitle className="text-base">{t('ปิดใช้งานบัญชี')}</DialogTitle><DialogDescription className="text-sm">{t('ผู้ใช้นี้จะเข้าสู่ระบบไม่ได้ ประวัติการตรวจยังคงอยู่ และสามารถเปิดใช้งานบัญชีอีกครั้งได้')} {user?.name ? `(${user.name})` : ''}</DialogDescription></DialogHeader>
    <div className="flex justify-end gap-2 pt-1"><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{t('ยกเลิก')}</Button><Button type="button" variant="destructive" disabled={busy} onClick={deactivate} className="gap-2">{busy && <LoaderCircle size={14} className="animate-spin" />} {t('ปิดใช้งาน')}</Button></div>
  </DialogContent></Dialog>
}

function ResetPasswordDialog({ user, onOpenChange }: { user: User | null; onOpenChange: (open: boolean) => void }) {
  const { t } = useI18n()
  const [busy, setBusy] = useState(false)
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  function close() {
    setPassword('')
    setConfirmPassword('')
    onOpenChange(false)
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!user) return
    if (password.length < 6) return toast.error(t('รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร'))
    if (password !== confirmPassword) return toast.error(t('รหัสผ่านไม่ตรงกัน'))
    setBusy(true)
    try {
      await api.resetPassword(user.id, password)
      toast.success(`${t('ตั้งรหัสผ่านใหม่ให้')} ${user.name} ${t('แล้ว')}`)
      setPassword('')
      setConfirmPassword('')
      onOpenChange(false)
    } catch (error) { toast.error(t(error instanceof Error ? error.message : 'บันทึกไม่สำเร็จ')) }
    finally { setBusy(false) }
  }
  return <Dialog open={Boolean(user)} onOpenChange={(open) => { if (!open) close() }}><DialogContent className="max-w-sm">
    <DialogHeader><div className="mb-1 grid size-9 place-items-center rounded-xl bg-[#edf5f3] text-primary"><KeyRound size={17} /></div><DialogTitle className="text-base">{t('ตั้งรหัสผ่านใหม่')}</DialogTitle><DialogDescription className="text-xs">{t('บัญชี')} {user?.username} · {user?.name}</DialogDescription></DialogHeader>
    <form onSubmit={save} className="space-y-4 pt-1"><div className="grid gap-3"><PasswordInput id="reset-password" label={t('รหัสผ่านใหม่')} value={password} onChange={setPassword} placeholder={t('อย่างน้อย 6 ตัวอักษร')} /><div className="grid gap-1.5"><PasswordInput id="reset-password-confirm" label={t('ยืนยันรหัสผ่าน')} value={confirmPassword} onChange={setConfirmPassword} placeholder={t('กรอกรหัสผ่านอีกครั้ง')} invalid={Boolean(confirmPassword) && password !== confirmPassword} />{Boolean(confirmPassword) && password !== confirmPassword && <p className="text-xs text-destructive" role="alert">{t('รหัสผ่านไม่ตรงกัน')}</p>}</div></div><div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={close}>{t('ยกเลิก')}</Button><Button type="submit" disabled={busy} className="gap-2">{busy && <LoaderCircle size={14} className="animate-spin" />} {t('บันทึกรหัสผ่าน')}</Button></div></form>
  </DialogContent></Dialog>
}

function PasswordInput({ id, label, value, onChange, placeholder, invalid = false }: { id: string; label: string; value: string; onChange: (value: string) => void; placeholder: string; invalid?: boolean }) {
  const { t } = useI18n()
  const [visible, setVisible] = useState(false)
  return <div className="grid gap-1.5"><Label htmlFor={id}>{label}</Label><div className="relative"><Input id={id} type={visible ? 'text' : 'password'} minLength={6} value={value} onChange={(event) => onChange(event.target.value)} autoComplete="new-password" required placeholder={placeholder} aria-invalid={invalid || undefined} className="pr-11" /><Button type="button" variant="ghost" size="icon" aria-label={t(visible ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน')} onClick={() => setVisible((current) => !current)} className="absolute right-0 top-0 h-10 w-10 text-muted-foreground hover:bg-transparent">{visible ? <EyeOff size={17} /> : <Eye size={17} />}</Button></div></div>
}
