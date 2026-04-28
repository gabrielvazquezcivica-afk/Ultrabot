// ─────────────────────────────
// CONFIGURACIÓN GLOBAL ULTRABOT
// ─────────────────────────────

// 🔧 Normalizador JID
const toJid = (n) => {
  if (!n) return null
  if (n.includes('@')) return n
  return n.length > 15
    ? `${n}@lid`
    : `${n}@s.whatsapp.net`
}

// ───── CONFIG PRINCIPAL ─────
const config = {

  // ───── BOT ─────
  bot: {
    name: '𝐔𝐥𝐭𝐫𝐚𝐁𝐨𝐭',
    prefix: '.',
    public: true,
    version: '2.2.0',
    description: 'Bot de WhatsApp'
  },

  // ───── OWNER / CREADOR ─────
  owner: {
    name: 'SoyGabo',

    numbers: [
      '13652980907' // Cambia por tu número
    ],

    jid: [
      '1216247509077@lid' // Si tienes JIDs ya definidos, agrégalos aquí
    ]
  },

  // ───── CONEXIÓN Y ACCESO ─────
  login: {
    pairing: false, // true = usar código de 8 dígitos | false = usar código QR
    tiempoLimiteMensaje: 120000 // Tiempo en milisegundos para ignorar mensajes antiguos (2min por defecto)
  },

  // ───── RENDIMIENTO Y FUNCIONAMIENTO ─────
  system: {
    omitirRegistrosInnecesarios: false,
    procesarMensajesEnParalelo: true,
    recargaRapida: true,
    limitarProcesos: false
  },

  // ───── MENSAJES GLOBALES PARA PLUGINS ─────
  messages: {
    error: '❌ Ocurrió un error, intenta nuevamente',
    admin: '⚠️ Este comando es solo para administradores del grupo',
    owner: '⚠️ Este comando es exclusivo para el dueño del bot',
    group: '⚠️ Este comando solo puede usarse dentro de grupos',
    botAdmin: '⚠️ Necesito ser administrador del grupo para poder ejecutar esta acción'
  }

}

// 🔥 Normalizar y completar todos los JID del dueño
config.owner.jid = config.owner.jid
  .concat(config.owner.numbers.map(toJid))
  .filter(Boolean)

export default config
