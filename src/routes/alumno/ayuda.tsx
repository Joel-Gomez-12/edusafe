export default function AlumnoAyuda() {
  const items = [
    {
      emoji: '🕶️',
      title: 'Modo camuflaje',
      desc: 'El botón X y el icono de máscara transforman la app en una calculadora al instante. Útil si alguien se acerca.',
    },
    {
      emoji: '🔑',
      title: 'Tu llave de 3 emojis',
      desc: 'Eliges 3 emojis al crear tu reporte. Son tu contraseña para volver a ver tu caso. No los compartas.',
    },
    {
      emoji: '🔒',
      title: 'Nadie sabe quién eres',
      desc: 'El mediador ve tu reporte y los nombres de las personas implicadas, pero NO tu identidad.',
    },
    {
      emoji: '⏱️',
      title: 'Tiempo de respuesta',
      desc: 'El mediador responde en menos de 24h laborables. Los casos críticos en menos de 2h.',
    },
  ]

  return (
    <div className="flex flex-col min-h-svh bg-cream">

      <div className="bg-alumno px-5 pt-12 pb-5 rounded-b-3xl">
        <h1 className="font-display text-2xl font-bold text-white">¿Cómo funciona?</h1>
        <p className="text-sm text-white/60 mt-0.5">Tu seguridad explicada en 4 puntos</p>
      </div>

      <div className="px-5 pt-5 flex flex-col gap-3">
        {items.map(item => (
          <div key={item.title} className="bg-white rounded-2xl p-4 shadow-sm">
            <div className="flex items-center gap-3 mb-2">
              <span className="text-xl">{item.emoji}</span>
              <p className="font-semibold text-ink text-sm">{item.title}</p>
            </div>
            <p className="text-sm text-ink/60 leading-snug">{item.desc}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
