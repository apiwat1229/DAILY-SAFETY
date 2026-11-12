/** Decorative safety illustration (hard hat, shield, goggles, warning sign, vest) drawn with the theme colours; purely visual. */
export function SafetyBackdrop({ className = '', artClassName = 'absolute -bottom-10 -right-16 w-[135%] max-w-none opacity-[.95]' }: { className?: string; artClassName?: string }) {
  return <div aria-hidden="true" className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`}>
    <div className="absolute inset-0" style={{ background: 'radial-gradient(1200px 700px at 85% 110%, color-mix(in srgb, var(--primary) 55%, transparent), transparent 60%), radial-gradient(900px 600px at 0% 0%, color-mix(in srgb, var(--primary) 28%, transparent), transparent 55%)' }} />
    <svg className={artClassName} viewBox="0 0 640 560" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="hat" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#fde047" /><stop offset="1" stopColor="#f59e0b" /></linearGradient>
        <linearGradient id="shield" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#ffffff" stopOpacity=".95" /><stop offset="1" stopColor="#ffffff" stopOpacity=".55" /></linearGradient>
      </defs>
      {/* soft rings */}
      <circle cx="360" cy="330" r="250" stroke="#fff" strokeOpacity=".08" strokeWidth="2" />
      <circle cx="360" cy="330" r="190" stroke="#fff" strokeOpacity=".1" strokeWidth="2" />
      <circle cx="360" cy="330" r="130" fill="#fff" fillOpacity=".05" />
      {/* hard hat */}
      <g transform="translate(150 150)">
        <path d="M30 230C30 110 110 30 210 30s180 80 180 200z" fill="url(#hat)" />
        <path d="M180 30h60v200h-60z" fill="#000" fillOpacity=".12" />
        <path d="M60 200C70 110 130 52 210 46" stroke="#fff" strokeOpacity=".55" strokeWidth="10" strokeLinecap="round" />
        <rect x="-10" y="226" width="440" height="44" rx="22" fill="#f59e0b" />
        <rect x="-10" y="256" width="440" height="14" rx="7" fill="#000" fillOpacity=".12" />
      </g>
      {/* shield badge */}
      <g transform="translate(395 40)">
        <path d="M110 0 210 36v90c0 74-46 124-100 148C56 250 10 200 10 126V36z" fill="url(#shield)" />
        <path d="m62 126 36 36 62-70" stroke="var(--primary)" strokeWidth="22" strokeLinecap="round" strokeLinejoin="round" />
      </g>
      {/* goggles */}
      <g transform="translate(40 60)" stroke="#fff" strokeOpacity=".7" strokeWidth="9" fill="#fff" fillOpacity=".12">
        <rect x="0" y="20" width="84" height="56" rx="26" /><rect x="100" y="20" width="84" height="56" rx="26" /><path d="M84 46h16M0 44H-18M184 44h18" fill="none" strokeLinecap="round" />
      </g>
      {/* warning sign */}
      <g transform="translate(70 380)">
        <path d="M60 6 118 108H2z" fill="#facc15" stroke="#fff" strokeOpacity=".6" strokeWidth="6" strokeLinejoin="round" />
        <path d="M60 44v34" stroke="#111827" strokeWidth="11" strokeLinecap="round" /><circle cx="60" cy="94" r="6.5" fill="#111827" />
      </g>
      {/* safety vest */}
      <g transform="translate(250 392)" opacity=".92">
        <path d="M24 0 58 14 92 0l36 36-24 14v110H46V50L22 36z" fill="#a3e635" />
        <path d="M46 92h58M46 124h58" stroke="#fff" strokeOpacity=".85" strokeWidth="12" />
      </g>
    </svg>
    <div className="absolute inset-x-0 bottom-0 h-3" style={{ background: 'repeating-linear-gradient(135deg, #facc15 0 18px, #111827 18px 36px)' }} />
  </div>
}
