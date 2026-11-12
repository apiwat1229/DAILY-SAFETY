/** Cartoon safety team for the login page: rubber-bale mascot, officers, inspector, firefighter and a cone. Purely decorative. */
export function SafetyMascots({ className = '' }: { className?: string }) {
  const ink = '#0F172A'
  return <svg aria-hidden="true" viewBox="0 0 420 175" className={`h-auto w-full overflow-visible drop-shadow-xl ${className}`} fill="none">
    <ellipse cx="210" cy="166" rx="195" ry="7" fill="#060E1A" fillOpacity=".6" />

    {/* Rubber bale mascot */}
    <g className="animate-float">
      <path d="M52 138V158H45" stroke="#1E293B" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M74 138V158H81" stroke="#1E293B" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M36 102Q22 92 26 80" stroke="#78350F" strokeWidth="4.5" strokeLinecap="round" /><circle cx="26" cy="79" r="4.5" fill="#FDE047" />
      <path d="M90 102Q104 94 102 82" stroke="#78350F" strokeWidth="4.5" strokeLinecap="round" /><circle cx="102" cy="81" r="4.5" fill="#FDE047" />
      <rect x="36" y="64" width="54" height="76" rx="10" fill="#92400E" stroke="#451A03" strokeWidth="2.5" />
      <path d="M43 82Q63 77 83 82" stroke="#B45309" strokeWidth="2" strokeLinecap="round" />
      <path d="M43 122Q63 127 83 122" stroke="#B45309" strokeWidth="2" strokeLinecap="round" />
      <circle cx="53" cy="98" r="3" fill="#27272A" /><circle cx="73" cy="98" r="3" fill="#27272A" />
      <circle cx="48" cy="103" r="3.5" fill="#FCA5A5" fillOpacity=".7" /><circle cx="78" cy="103" r="3.5" fill="#FCA5A5" fillOpacity=".7" />
      <path d="M58 103Q63 109 68 103" stroke="#27272A" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M38 64C38 45 88 45 88 64Z" fill="#FACC15" stroke="#451A03" strokeWidth="2.2" />
      <rect x="33" y="62" width="60" height="5" rx="2.5" fill="#EAB308" stroke="#451A03" strokeWidth="2" />
      <circle cx="63" cy="54" r="6" fill="#fff" /><path d="M63 50V58M59 54H67" stroke="#00873E" strokeWidth="2.2" strokeLinecap="round" />
    </g>

    {/* Officer holding the Safety First sign */}
    <g>
      <rect x="136" y="136" width="9" height="22" rx="3" fill="#1D4ED8" stroke={ink} strokeWidth="2" />
      <rect x="151" y="136" width="9" height="22" rx="3" fill="#1D4ED8" stroke={ink} strokeWidth="2" />
      <path d="M133 158H146V163H131Z" fill="#1E293B" /><path d="M150 158H163V163H148Z" fill="#1E293B" />
      <path d="M132 104L164 104L168 138L128 138Z" fill="#2563EB" stroke={ink} strokeWidth="2" strokeLinejoin="round" />
      <circle cx="148" cy="84" r="19" fill="#FFEDD5" stroke={ink} strokeWidth="2" />
      <path d="M129 82C129 66 167 66 167 82C167 76 156 73 148 78C140 73 129 76 129 82Z" fill="#451A03" />
      <circle cx="141" cy="85" r="2.2" fill={ink} /><circle cx="155" cy="85" r="2.2" fill={ink} />
      <circle cx="136" cy="89" r="3" fill="#FDA4AF" fillOpacity=".7" /><circle cx="160" cy="89" r="3" fill="#FDA4AF" fillOpacity=".7" />
      <path d="M144 90Q148 94 152 90" stroke={ink} strokeWidth="2" strokeLinecap="round" />
      <path d="M127 73C127 52 169 52 169 73Z" fill="#FACC15" stroke={ink} strokeWidth="2" />
      <rect x="122" y="71" width="52" height="5" rx="2.5" fill="#EAB308" stroke={ink} strokeWidth="1.8" />
      <circle cx="148" cy="62" r="5.5" fill="#fff" /><path d="M148 58.5V65.5M144.5 62H151.5" stroke="#00873E" strokeWidth="2" strokeLinecap="round" />
      <rect x="118" y="109" width="60" height="26" rx="5" fill="#fff" stroke={ink} strokeWidth="2" />
      <text x="148" y="121" textAnchor="middle" fill="#00873E" fontFamily="Inter, sans-serif" fontWeight="800" fontSize="8.5">Safety First</text>
      <text x="148" y="131" textAnchor="middle" fill="#1E293B" fontFamily="Prompt, sans-serif" fontWeight="600" fontSize="7.5">ปลอดภัยไว้ก่อน</text>
      <circle cx="120" cy="122" r="4" fill="#FACC15" stroke={ink} strokeWidth="1.5" /><circle cx="176" cy="122" r="4" fill="#FACC15" stroke={ink} strokeWidth="1.5" />
    </g>

    {/* Safety inspector with goggles and checklist */}
    <g>
      <rect x="225" y="132" width="11" height="26" rx="3" fill="#1E40AF" stroke={ink} strokeWidth="2" />
      <rect x="243" y="132" width="11" height="26" rx="3" fill="#1E40AF" stroke={ink} strokeWidth="2" />
      <path d="M222 157H237V163H220Z" fill={ink} /><path d="M242 157H257V163H240Z" fill={ink} />
      <path d="M219 95L260 95L264 134L215 134Z" fill="#1D4ED8" stroke={ink} strokeWidth="2" strokeLinejoin="round" />
      <rect x="224" y="96" width="5" height="37" fill="#A3E635" /><rect x="250" y="96" width="5" height="37" fill="#A3E635" />
      <path d="M217 102L204 88" stroke="#1D4ED8" strokeWidth="9" strokeLinecap="round" /><circle cx="202" cy="85" r="6" fill="#FACC15" stroke={ink} strokeWidth="1.8" />
      <rect x="254" y="106" width="18" height="22" rx="2.5" fill="#F8FAFC" stroke={ink} strokeWidth="1.8" transform="rotate(-10 254 106)" />
      <path d="M258 112L261 115L267 109" stroke="#00873E" strokeWidth="2" strokeLinecap="round" />
      <circle cx="239" cy="73" r="22" fill="#FFEDD5" stroke={ink} strokeWidth="2" />
      <rect x="221" y="67" width="36" height="13" rx="5" fill="#E0F2FE" fillOpacity=".75" stroke="#0284C7" strokeWidth="2" />
      <line x1="239" y1="67" x2="239" y2="80" stroke="#0284C7" strokeWidth="1.8" />
      <circle cx="231" cy="74" r="2.3" fill={ink} /><circle cx="247" cy="74" r="2.3" fill={ink} />
      <path d="M234 83Q239 89 244 83Z" fill="#F43F5E" stroke={ink} strokeWidth="1.5" />
      <path d="M215 61C215 37 263 37 263 61Z" fill="#fff" stroke={ink} strokeWidth="2.2" />
      <rect x="209" y="59" width="60" height="5.5" rx="2.5" fill="#F1F5F9" stroke={ink} strokeWidth="2" />
      <circle cx="239" cy="49" r="6.5" fill="#00873E" /><path d="M239 45V53M235 49H243" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" />
    </g>

    {/* Firefighter with extinguisher */}
    <g className="animate-float-delayed">
      <rect x="316" y="137" width="9" height="21" rx="2" fill="#DC2626" stroke={ink} strokeWidth="2" />
      <rect x="331" y="137" width="9" height="21" rx="2" fill="#DC2626" stroke={ink} strokeWidth="2" />
      <path d="M311 104L345 104L349 139L307 139Z" fill="#EF4444" stroke={ink} strokeWidth="2" strokeLinejoin="round" />
      <rect x="309" y="124" width="38" height="4" fill="#FACC15" />
      <circle cx="328" cy="85" r="18" fill="#FFEDD5" stroke={ink} strokeWidth="2" />
      <circle cx="322" cy="86" r="2.1" fill={ink} /><circle cx="334" cy="86" r="2.1" fill={ink} />
      <path d="M324 91Q328 95 332 91" stroke={ink} strokeWidth="1.8" strokeLinecap="round" />
      <path d="M308 75C308 55 348 55 348 75Z" fill="#FACC15" stroke={ink} strokeWidth="2" />
      <path d="M303 74H353L350 79H306Z" fill="#EAB308" stroke={ink} strokeWidth="1.8" />
      <rect x="353" y="114" width="18" height="46" rx="7" fill="#DC2626" stroke={ink} strokeWidth="2" />
      <rect x="356" y="126" width="12" height="14" rx="2" fill="#fff" />
      <path d="M362 114V106H370M358 109L351 116" stroke="#1E293B" strokeWidth="3" strokeLinecap="round" />
      <circle cx="352" cy="124" r="4.5" fill="#FACC15" stroke={ink} strokeWidth="1.5" />
    </g>

    {/* Cone */}
    <g>
      <path d="M385 162L393 132H401L409 162Z" fill="#F97316" stroke={ink} strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M389 148H405L406.5 153H387.5Z" fill="#fff" />
      <rect x="381" y="160" width="32" height="4" rx="2" fill="#EA580C" stroke={ink} strokeWidth="1.5" />
    </g>
  </svg>
}
