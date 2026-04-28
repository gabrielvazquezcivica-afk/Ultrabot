import config from '../config.js'

export const handler = async (m, { client, from }) => {
  const start = Date.now()

  // 🔥 Reacción instantánea para medir latencia real
  await client.sendMessage(from, {
    react: { text: '🏓', key: m.key }
  })

  const speed = Date.now() - start

  // 🔥 Respuesta final con información detallada
  await client.sendMessage(from, {
    text: `🏓 *Pong*

⚡ Velocidad: ${speed} ms
🚀 Estado: ${speed < 200 ? 'Rápido' : speed < 500 ? 'Normal' : 'Lento'}

> ${config.bot.name}`
  }, { quoted: m })
}

handler.command = ['p']
handler.help = ['p']
handler.tags = ['información']
handler.menu = true

export default handler
