import config from '../../config.js'

export const handler = async (m, {                  
  client,                  
  from,                  
  reply,                  
  pushName,                  
  plugins                  
}) => {                  

  // 🛑 Verificación de complementos cargados
  if (!Array.isArray(plugins) || plugins.length === 0) {                  
    return reply('❌ No hay comandos disponibles por el momento.')                  
  }                  

  // ⚡ Reacción al ejecutar el comando
  await client.sendMessage(from, { react: { text: '✨', key: m.key } })    

  // 📋 Datos obtenidos desde configuración
  const botName = config.bot.name
  const creador = config.owner.name
  const prefijo = config.bot.prefix
  const saludo = obtenerSaludo()    

  // 🎨 Emojis para cada categoría
  const emojisCategoria = {                  
    info: '📌',    
    herramientas: '🛠️',    
    diversion: '🎯',    
    grupo: '👥',    
    descargas: '📥',    
    juegos: '🎮',    
    busqueda: '🔍',    
    utilidades: '⚙️',    
    imagenes: '🖼️',    
    propietario: '👑',    
    administracion: '⚖️',    
    educacion: '📚',
    economia: '💰',
    interaccion: '💬',
    ajustes: '⚙️'
  }                  

  // 🎨 Emojis para los comandos dentro de cada categoría
  const emojisComando = {
    informacion: '💫',
    herramientas: '🔧',
    diversion: '🎈',
    grupo: '🪄',
    descargas: '📀',
    juegos: '🎲',
    busqueda: '🔎',
    utilidades: '📎',
    imagenes: '✏️',
    propietario: '💎',
    administracion: '🔒',
    educacion: '📖',
    economia: '💵',
    interaccion: '💭',
    ajustes: '📌'
  }    

  // 📂 Organizar comandos por categorías
  const categorias = {}                  
  let cantidadTotal = 0                  

  for (const complemento of plugins) {                  
    const funcion = complemento.handler ?? complemento    
    if (!funcion?.command || !funcion?.tags) continue    

    const listaComandos = Array.isArray(funcion.command) ? funcion.command : [funcion.command]    

    for (const etiqueta of funcion.tags) {    
      if (!categorias[etiqueta]) categorias[etiqueta] = []    
      categorias[etiqueta].push(...listaComandos)    
      cantidadTotal += listaComandos.length    
    }    
  }    

  // 📌 Orden personalizado en el que aparecerán las categorías
  const ordenCategorias = [    
    'informacion',    
    'utilidades',
    'herramientas',
    'grupo',    
    'descargas',    
    'juegos',    
    'diversion',
    'busqueda',
    'imagenes',
    'interaccion',
    'educacion',
    'economia',
    'administracion',
    'ajustes',
    'propietario'
  ]    

  // ✨ Construcción del diseño del menú
  let contenido = `┏━━━━━━━━━━━━━━━━━━━━┓
┃ 🤖 ${botName.toUpperCase()}
┗━━━━━━━━━━━━━━━━━━━━┛

👋 ${saludo}
👤 Usuario: ${pushName || 'Desconocido'}
🔖 Versión: ${config.bot.version}
👨‍💻 Creador: ${creador}
📋 Total de comandos: ${cantidadTotal}

`

  for (const categoria of ordenCategorias) {    
    if (!categorias[categoria]) continue
    const emojiTitulo = emojisCategoria[categoria] || '🔹'
    const emojiElemento = emojisComando[categoria] || '🔸'

    contenido += `┌────────────────────┐
│ ${emojiTitulo} ${categoria.toUpperCase()}
└────────────────────┘
`

    for (const comando of categorias[categoria]) {    
      contenido += `${emojiElemento} ${prefijo}${comando}\n`
    }
    contenido += `\n`
  }    

  contenido += `> 👑 CREADOR: SoyGabo`    

  // 📤 Envío del menú con la imagen
  await client.sendMessage(from, {
    image: { url: 'https://i.postimg.cc/0jXLvZxR/868bfb1ce56805562e86e1b517df1460.jpg' },
    caption: contenido
  })
}   

handler.command = ['menu']    
handler.tags = ['informacion']    
handler.menu = true

export default handler    

function obtenerSaludo() {    
  const horaActual = new Date().getHours()    
  if (horaActual >= 5 && horaActual < 12) return '☀️ ¡Buenos días! Que tengas un día excelente'    
  if (horaActual >= 12 && horaActual < 19) return '🌤️ ¡Buenas tardes! Espero todo vaya muy bien'    
  return '🌙 ¡Buenas noches! Que descanses y sueñes bonito'    
                                        }
