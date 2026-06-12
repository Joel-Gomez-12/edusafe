export default function AlumnoRecursos() {
  const recursos = [
    {
      emoji: '📞',
      bg: 'bg-red-100',
      title: '016 · 024',
      desc: 'Conducta suicida y violencia · 24/7 · No queda registro en la factura',
      href: 'tel:016',
    },
    {
      emoji: '📱',
      bg: 'bg-green-100',
      title: 'ANAR Niños y Adolescentes',
      desc: '900 20 20 10 · Confidencial · 24/7',
      href: 'tel:900202010',
    },
    {
      emoji: '🛡️',
      bg: 'bg-gray-100',
      title: 'Qué es el ciberacoso',
      desc: 'Señales, ejemplos y cómo protegerte en redes',
      href: 'https://www.is4k.es/necesitas-saber/ciberacoso',
    },
    {
      emoji: '👨‍👩‍👧',
      bg: 'bg-alumno-lt',
      title: 'Hablar con tu familia',
      desc: 'Guía paso a paso para encontrar el momento',
      href: 'https://www.anar.org',
    },
  ]

  return (
    <div className="flex flex-col min-h-svh bg-cream">

      <div className="bg-alumno px-5 pt-12 pb-5 rounded-b-3xl">
        <h1 className="font-display text-2xl font-bold text-white">Recursos</h1>
        <p className="text-sm text-white/60 mt-0.5">Información y ayuda fuera de la app</p>
      </div>

      <div className="px-5 pt-5 flex flex-col gap-3">

        {/* Banner */}
        <div className="bg-sage-lt rounded-2xl p-4 flex items-start gap-3">
          <span className="text-xl mt-0.5">💚</span>
          <p className="text-sm text-sage-dk leading-snug font-medium">
            No estás solo. Lo que sientes es válido, y hay personas preparadas para ayudarte.
          </p>
        </div>

        {/* Cards */}
        {recursos.map(r => (
          <a
            key={r.title}
            href={r.href}
            target={r.href.startsWith('http') ? '_blank' : undefined}
            rel="noreferrer"
            className="bg-white rounded-2xl p-4 flex items-center gap-4 shadow-sm active:scale-[0.98] transition-base"
          >
            <div className={`w-11 h-11 ${r.bg} rounded-xl flex items-center justify-center text-xl flex-shrink-0`}>
              {r.emoji}
            </div>
            <div>
              <p className="font-semibold text-ink text-sm">{r.title}</p>
              <p className="text-xs text-ink/50 mt-0.5 leading-snug">{r.desc}</p>
            </div>
          </a>
        ))}
      </div>
    </div>
  )
}
