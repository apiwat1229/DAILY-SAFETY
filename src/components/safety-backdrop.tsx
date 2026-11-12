/** Industrial backdrop for the login page: faint grid, glow, pipes at the top right and a factory skyline at the bottom. Decorative only. */
export function SafetyBackdrop({ className = '' }: { className?: string }) {
  return <div aria-hidden="true" className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`}>
    <div className="absolute inset-0" style={{
      backgroundImage: 'radial-gradient(circle at 85% 15%, color-mix(in srgb, var(--primary) 40%, transparent) 0%, transparent 45%), radial-gradient(circle at 15% 85%, color-mix(in srgb, var(--primary) 22%, transparent) 0%, transparent 40%), linear-gradient(to right, rgba(255,255,255,.035) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,.035) 1px, transparent 1px)',
      backgroundSize: '100% 100%, 100% 100%, 32px 32px, 32px 32px',
    }} />
    <svg className="absolute right-6 top-0 h-52 w-40 opacity-35 sm:right-12 sm:w-52" viewBox="0 0 200 200" fill="none">
      <path d="M140 0V70Q140 90 120 90H40Q20 90 20 110V200" stroke="#64748B" strokeWidth="18" strokeLinecap="round" />
      <path d="M140 0V70Q140 90 120 90H40Q20 90 20 110V200" stroke="#94A3B8" strokeWidth="4" strokeDasharray="8 8" />
      <rect x="126" y="35" width="28" height="8" rx="3" fill="#475569" /><rect x="75" y="76" width="8" height="28" rx="3" fill="#475569" /><rect x="6" y="145" width="28" height="8" rx="3" fill="#475569" />
    </svg>
    <svg className="absolute bottom-0 left-0 h-40 w-full text-blue-300 opacity-15 sm:h-52" viewBox="0 0 800 200" preserveAspectRatio="none" fill="currentColor">
      <path d="M0 200V130H60V90L110 120V90L160 120V140H240V70H270V140H350V100H430V150H540V80H580V150H700V110H800V200Z" />
    </svg>
    <div className="absolute inset-x-0 bottom-0 h-2.5" style={{ background: 'repeating-linear-gradient(135deg, #facc15 0 18px, #111827 18px 36px)' }} />
  </div>
}
