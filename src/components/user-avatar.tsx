import type { ReactNode } from 'react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import type { User } from '@/lib/types'

type Look = { bg: string; skin: string; hair?: string; style?: 'short' | 'pony'; hat?: 'yellow' | 'white' | 'fire' | 'cap' | 'medic'; extra?: 'goggles' | 'headset' | 'vest'; shirt: string }

/** Ids must match AVATAR_PRESETS in server/avatars.js. */
export const AVATAR_PRESETS: { id: string; label: string; look?: Look }[] = [
  { id: 'helmet-yellow', label: 'หมวกเหลือง', look: { bg: '#DBEAFE', skin: '#FFEDD5', hat: 'yellow', shirt: '#2563EB' } },
  { id: 'engineer-white', label: 'วิศวกร', look: { bg: '#E0F2FE', skin: '#FFEDD5', hat: 'white', extra: 'goggles', shirt: '#1D4ED8' } },
  { id: 'girl-yellow', label: 'เจ้าหน้าที่หญิง', look: { bg: '#FCE7F3', skin: '#FFEDD5', hair: '#451A03', style: 'pony', hat: 'yellow', shirt: '#2563EB' } },
  { id: 'firefighter', label: 'ดับเพลิง', look: { bg: '#FEE2E2', skin: '#FFEDD5', hat: 'fire', shirt: '#EF4444' } },
  { id: 'rubber-bale', label: 'ก้อนยาง' },
  { id: 'medic', label: 'พยาบาล', look: { bg: '#E0F2FE', skin: '#FDE2CF', hair: '#1E293B', style: 'short', hat: 'medic', shirt: '#38BDF8' } },
  { id: 'inspector', label: 'ผู้ตรวจ', look: { bg: '#FEF9C3', skin: '#F6D5B8', hat: 'white', extra: 'vest', shirt: '#1D4ED8' } },
  { id: 'technician', label: 'ช่างเทคนิค', look: { bg: '#EDE9FE', skin: '#E9B98F', hair: '#1E293B', style: 'short', hat: 'cap', extra: 'headset', shirt: '#7C3AED' } },
]

const INK = '#0F172A'

function Hat({ kind }: { kind: NonNullable<Look['hat']> }): ReactNode {
  if (kind === 'cap') return <g><path d="M17 29C17 15 47 15 47 29Z" fill="#1E40AF" stroke={INK} strokeWidth="1.6" /><path d="M14 29H45" stroke={INK} strokeWidth="3" strokeLinecap="round" /></g>
  if (kind === 'medic') return <g><path d="M18 27C18 16 46 16 46 27Z" fill="#fff" stroke={INK} strokeWidth="1.6" /><rect x="14" y="26" width="36" height="4" rx="2" fill="#F1F5F9" stroke={INK} strokeWidth="1.4" /><path d="M32 18v7M28.5 21.5h7" stroke="#EF4444" strokeWidth="2.2" strokeLinecap="round" /></g>
  const fill = kind === 'white' ? '#FFFFFF' : kind === 'fire' ? '#EF4444' : '#FACC15'
  const brim = kind === 'white' ? '#E2E8F0' : kind === 'fire' ? '#FACC15' : '#EAB308'
  return <g><path d="M17 28C17 12 47 12 47 28Z" fill={fill} stroke={INK} strokeWidth="1.6" /><rect x="13" y="26" width="38" height="5" rx="2.5" fill={brim} stroke={INK} strokeWidth="1.5" />
    {kind !== 'fire' && <><circle cx="32" cy="19" r="4.2" fill={kind === 'white' ? '#2563EB' : '#fff'} /><path d="M32 16.4v5.2M29.4 19h5.2" stroke={kind === 'white' ? '#fff' : '#2563EB'} strokeWidth="1.5" strokeLinecap="round" /></>}</g>
}

function Person({ look }: { look: Look }): ReactNode {
  return <g>
    <path d="M8 64c0-13 10-19 24-19s24 6 24 19z" fill={look.shirt} stroke={INK} strokeWidth="1.6" />
    {look.extra === 'vest' && <><path d="M20 48l5 16h4L26 47zM44 48l-5 16h-4l3-17z" fill="#A3E635" /><path d="M23 56h18" stroke="#fff" strokeWidth="2.4" /></>}
    <rect x="28" y="40" width="8" height="7" rx="2" fill={look.skin} stroke={INK} strokeWidth="1.4" />
    {look.style === 'pony' && <path d="M46 31c7 2 8 12 3 18-1-6-3-9-6-11z" fill={look.hair} stroke={INK} strokeWidth="1.2" />}
    <circle cx="32" cy="32" r="13.5" fill={look.skin} stroke={INK} strokeWidth="1.6" />
    {look.hair && <path d="M18.5 30c0-12 27-12 27 0-3-4-8-5-13.500-3-5.500-2-10.500-1-13.500 3z" fill={look.hair} />}
    <circle cx="27" cy="33" r="1.7" fill={INK} /><circle cx="37" cy="33" r="1.7" fill={INK} />
    <circle cx="23.500" cy="37" r="2.2" fill="#FDA4AF" fillOpacity=".7" /><circle cx="40.500" cy="37" r="2.2" fill="#FDA4AF" fillOpacity=".7" />
    <path d="M28.500 38q3.500 3.500 7 0" stroke={INK} strokeWidth="1.6" strokeLinecap="round" fill="none" />
    {look.extra === 'goggles' && <g><rect x="20" y="29" width="24" height="8" rx="4" fill="#E0F2FE" fillOpacity=".75" stroke="#0284C7" strokeWidth="1.6" /><path d="M32 29v8" stroke="#0284C7" strokeWidth="1.3" /></g>}
    {look.extra === 'headset' && <g stroke={INK} strokeWidth="1.4"><path d="M19 33a13 13 0 0 1 26 0" fill="none" /><rect x="15.500" y="31" width="5" height="9" rx="2.500" fill="#334155" /><rect x="43.500" y="31" width="5" height="9" rx="2.500" fill="#334155" /><path d="M46 40q-2 6-8 6" fill="none" /></g>}
    {look.hat && <Hat kind={look.hat} />}
  </g>
}

function BaleMascot(): ReactNode {
  return <g>
    <rect x="16" y="22" width="32" height="38" rx="7" fill="#92400E" stroke="#451A03" strokeWidth="1.8" />
    <path d="M20 32q12-4 24 0M20 52q12 4 24 0" stroke="#B45309" strokeWidth="1.5" strokeLinecap="round" fill="none" />
    <circle cx="26.500" cy="40" r="2" fill="#27272A" /><circle cx="37.500" cy="40" r="2" fill="#27272A" />
    <circle cx="23" cy="45" r="2.400" fill="#FCA5A5" fillOpacity=".7" /><circle cx="41" cy="45" r="2.400" fill="#FCA5A5" fillOpacity=".7" />
    <path d="M28.500 45q3.500 4 7 0" stroke="#27272A" strokeWidth="1.700" strokeLinecap="round" fill="none" />
    <path d="M18 23C18 9 46 9 46 23Z" fill="#FACC15" stroke="#451A03" strokeWidth="1.700" /><rect x="14" y="21" width="36" height="4.500" rx="2.200" fill="#EAB308" stroke="#451A03" strokeWidth="1.500" />
    <circle cx="32" cy="15.500" r="4" fill="#fff" /><path d="M32 13v5M29.500 15.500h5" stroke="#2563EB" strokeWidth="1.500" strokeLinecap="round" />
  </g>
}

/** The drawing for one preset, filling a square viewBox (used by the avatar and the picker). */
export function PresetArt({ id, className = 'size-full' }: { id: string; className?: string }) {
  const preset = AVATAR_PRESETS.find((entry) => entry.id === id)
  if (!preset) return null
  const bg = preset.look?.bg ?? '#FEF3C7'
  return <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
    <rect width="64" height="64" fill={bg} />
    {preset.look ? <Person look={preset.look} /> : <BaleMascot />}
  </svg>
}

/** The user's picture: uploaded photo, chosen cartoon, or the first letter of the name. */
export function UserAvatar({ user, className = 'size-9' }: { user: Pick<User, 'id' | 'name' | 'avatar'>; className?: string }) {
  const avatar = user.avatar || ''
  const initial = <AvatarFallback className="bg-sidebar-active text-sm font-semibold text-sidebar">{user.name.slice(0, 1)}</AvatarFallback>
  if (avatar.startsWith('preset:')) return <Avatar className={className}><div className="size-full overflow-hidden rounded-full"><PresetArt id={avatar.slice(7)} /></div></Avatar>
  if (avatar.startsWith('photo:')) return <Avatar className={className}><AvatarImage src={`/api/users/${user.id}/avatar?v=${encodeURIComponent(avatar.slice(6))}`} alt={user.name} className="object-cover" />{initial}</Avatar>
  return <Avatar className={className}>{initial}</Avatar>
}
