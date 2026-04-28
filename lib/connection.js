import { createRequire } from 'module'
const require = createRequire(import.meta.url)

const { makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys')
const chalk = require('chalk')
const pino = require('pino')

async function connectBot() {
    const { state, saveCreds } = await useMultiFileAuthState('./auth_info')

    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        syncFullHistory: false,
        markOnlineOnConnect: false,
        defaultQueryTimeoutMs: undefined,
        connectTimeoutMs: 180000,
        retryRequestDelayMs: 3000,
        keepAliveIntervalMs: 20000,
        fireInitQueries: false,
        shouldSyncHistoryMessage: () => false,
        browser: ['Linux', 'Chrome', '118.0.0'],
        version: [2, 2323, 4],
        generateHighQualityLinkPreview: false,
        logger: pino({ level: 'silent' })
    })

    sock.ev.on('connection.update', async (update) => {
        const { connection, pairingCode, isNewLogin } = update

        // Mostrar código de vinculación
        if (pairingCode && !isNewLogin) {
            console.log(chalk.magenta.bold('\n🔑 CÓDIGO PARA VINCULAR:'))
            console.log(chalk.green.bold(`>>> ${pairingCode} <<<`))
            console.log(chalk.yellow('─────────────────────────────────────'))
            console.log(chalk.cyan('Pasos para vincular:'))
            console.log(chalk.cyan('1. Abre WhatsApp > Ajustes ⚙️ > Dispositivos vinculados'))
            console.log(chalk.cyan('2. Pulsa en "Vincular dispositivo"'))
            console.log(chalk.cyan('3. Abajo del todo selecciona: ¿No puedes escanear el código?'))
            console.log(chalk.cyan('4. Escribe el código que aparece arriba\n'))
        }

        // Cuando se conectó bien
        if (connection === 'open') {
            console.log(chalk.green.bold('✅ ¡VINCULACIÓN EXITOSA! El bot ya está funcionando correctamente\n'))
        }

        // Cuando se desconecta
        if (connection === 'close') {
            const razon = update?.lastDisconnect?.error?.output?.statusCode
            const motivo = DisconnectReason[razon] || 'Desconocido'

            if (razon === DisconnectReason.loggedOut) {
                console.log(chalk.red('🚫 Sesión cerrada definitivamente. Borra la carpeta auth_info y vuelve a iniciar.'))
            } else {
                console.log(chalk.yellow(`⚠️ Conexión interrumpida: ${motivo}. Intentando conectar nuevamente...`))
            }
        }
    })

    // Guardar datos
    sock.ev.on('creds.update', saveCreds)

    return sock
}

export { connectBot }
      
