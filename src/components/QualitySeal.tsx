// Quality seal shown on the landing page. Change SEAL_NAME to rebrand the seal in one place.
export const SEAL_NAME = "thesisfic.edu";

export default function QualitySeal({ size = 260, className = "" }: { size?: number; className?: string }) {
  const ring = `${SEAL_NAME.toUpperCase()} · ACADEMIC QUALITY SEAL · AI ERA STANDARD · `;
  return (
    <figure className={`flex flex-col items-center gap-3 ${className}`} aria-label={`${SEAL_NAME} academic quality seal`}>
      <svg width={size} height={size} viewBox="0 0 260 260" role="img" className="drop-shadow-xl">
        <title>{`${SEAL_NAME} academic quality seal`}</title>
        <defs>
          <linearGradient id="seal-fill" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#364fc7" />
            <stop offset="1" stopColor="#087f5b" />
          </linearGradient>
          <path id="seal-ring" d="M130,130 m-96,0 a96,96 0 1,1 192,0 a96,96 0 1,1 -192,0" />
        </defs>
        {/* scalloped outer edge */}
        <g fill="url(#seal-fill)">
          {Array.from({ length: 36 }).map((_, i) => {
            const a = (i / 36) * Math.PI * 2;
            return <circle key={i} cx={130 + Math.cos(a) * 118} cy={130 + Math.sin(a) * 118} r="11" />;
          })}
          <circle cx="130" cy="130" r="118" />
        </g>
        <circle cx="130" cy="130" r="108" fill="none" stroke="#ffffff" strokeOpacity="0.55" strokeWidth="1.5" />
        <circle cx="130" cy="130" r="80" fill="none" stroke="#ffffff" strokeOpacity="0.55" strokeWidth="1.5" />
        <g className="seal-spin" style={{ transformOrigin: "130px 130px" }}>
          <text fill="#ffffff" fontSize="12" fontWeight="700" fontFamily="Inter, system-ui, sans-serif">
            <textPath href="#seal-ring" startOffset="0" textLength="600" lengthAdjust="spacing">{ring}</textPath>
          </text>
        </g>
        {/* center */}
        <circle cx="130" cy="130" r="74" fill="#ffffff" fillOpacity="0.1" />
        <path d="M130 84 l-30 11 v24 c0 22 30 38 30 38 s30-16 30-38 v-24 z" fill="none" stroke="#ffffff" strokeWidth="5" strokeLinejoin="round" />
        <path d="M117 121 l9 9 l17 -19" fill="none" stroke="#ffffff" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
        <text x="130" y="176" textAnchor="middle" fill="#ffffff" fontSize="15" fontWeight="800" fontFamily="Inter, system-ui, sans-serif" letterSpacing="0.5">
          {SEAL_NAME}
        </text>
        <text x="130" y="194" textAnchor="middle" fill="#ffffff" fillOpacity="0.8" fontSize="9.5" fontWeight="600" letterSpacing="2.5" fontFamily="Inter, system-ui, sans-serif">
          VERIFIED PROCESS
        </text>
      </svg>
      <figcaption className="text-center max-w-[16rem]">
        <span className="block text-sm font-semibold text-gray-900">Academic quality seal</span>
        <span className="block text-xs text-gray-500 mt-0.5">Awarded to theses written in a regulated, transparent process: every AI contribution declared, every source attributed.</span>
      </figcaption>
    </figure>
  );
}
