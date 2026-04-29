import {
  makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason
} from '@whiskeysockets/baileys'

import pino from 'pino'
import chalk from 'chalk'
import qrcode from 'qrcode-terminal'
import readline from 'readline'
import fs from 'fs'

// Configuración para evitar errores de memoria
process.setMaxListeners(0)

// ✅ Convertido a CLASE tal como lo tienes en tu proyecto
export default class LibConnection {
    constructor() {
        this.authFolder = './auth_info'
        this.metodo = null
        this.numero = null
    }

    async connect() {
        if (!fs.existsSync(this.authFolder)) {
            fs.mkdirSync(this.authFolder, { recursive: true })
        }

        const { state, saveCreds } = await useMultiFileAuthState(this.authFolder)
        const { version } = await fetchLatestBaileysVersion()

        // Interfaz para ingresar datos
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        })

        // Mostrar menú de opciones
        console.log(chalk.cyan.bold('====================================='))
        console.log(chalk.cyan.bold('    CONEXIÓN A WHATSAPP - ULTRABOT  '))
        console.log(chalk.cyan.bold('=====================================\n'))
        console.log(chalk.yellow.bold('📋 SELECCIONA EL MÉTODO DE VINCULACIÓN:'))
        console.log(chalk.green('🔢 Opción 1: Usar código numérico'))
        console.log(chalk.green('📱 Opción 2: Usar código QR\n'))

        this.metodo = await new Promise(respuesta => {
            rl.question(
                chalk.blue('👉 Escribe el número de la opción (1 o 2): '),
                dato => respuesta(dato.trim())
            )
        })

        if (this.metodo === '1') {
            console.log(chalk.blue('\n📝 Ingresa tu número con código de país, ejemplo: 521234567890'))
            console.log(chalk.blue('⚠️ Solo números, sin espacios, signos ni el símbolo +\n'))

            this.numero = await new Promise(respuesta => {
                rl.question(
                    chalk.blue('📱 Tu número: '),
                    dato => respuesta(dato.replace(/\D/g, ''))
                )
            })

            if (!this.numero || this.numero.length < 10) {
                console.log(chalk.red.bold('\n❌ Número inválido, revisa e intenta nuevamente'))
                rl.close()
                process.exit(1)
            }
        }

        rl.close()

        const sock = makeWASocket({
            version,
            auth: state,
            logger: pino({ level: 'fatal' }),
            printQRInTerminal: this.metodo === '2',
            syncFullHistory: false,
            markOnlineOnConnect: false,
            generateHighQualityLinkPreview: false,
            browser: ['ChappieBot', 'Chrome', '1.0']
        })

        // ───── CONEXIÓN Y GESTIÓN DE EVENTOS ─────
        sock.ev.on('connection.update', async update => {
            const { connection, qr, lastDisconnect } = update

            // 📱 MOSTRAR CÓDIGO QR SI SE ELIGIÓ ESA OPCIÓN
            if (this.metodo === '2' && qr && !state.creds.registered) {
                console.log(chalk.yellow('\n📱 Escanea este código QR:\n'))
                qrcode.generate(qr, { small: true })
            }

            // 🔢 GENERAR Y MOSTRAR CÓDIGO NUMÉRICO
            if (this.metodo === '1' && !state.creds.registered && this.numero) {
                await new Promise(res => setTimeout(res, 12000))

                try {
                    const codigoVinculacion = await sock.requestPairingCode(`+${this.numero}`)
                    
                    console.log('\n' + '═'.repeat(50))
                    console.log(chalk.green.bold('✅ CÓDIGO GENERADO CORRECTAMENTE'))
                    console.log(chalk.magenta.bold(`🔑 TU CÓDIGO: ${codigoVinculacion}`))
                    console.log('═'.repeat(50) + '\n')
                    console.log(chalk.blue.bold('📋 PASOS PARA VINCULAR:'))
                    console.log('1. Ve a: Ajustes → Dispositivos vinculados → Vincular dispositivo')
                    console.log('2. Elige la opción: "Vincular con número de teléfono"')
                    console.log('3. Escribe el código TODO EN MAYÚSCULAS, sin espacios ni nada más')
                    console.log('4. ⏰ Tienes menos de 25 segundos, escribe rápido')
                    console.log('5. No tengas activado VPN ni ninguna conexión modificada\n')
                } catch (err) {
                    console.log(chalk.red.bold(`❌ Error al generar código: ${err.message}`))
                    process.exit(1)
                }
            }

            // ✅ CUANDO YA ESTÁ CONECTADO
            if (connection === 'open') {
                console.log(chalk.green('✅ WhatsApp conectado correctamente'))
            }

            // ❌ CUANDO SE CIERRA LA CONEXIÓN
            if (connection === 'close') {
                const razon = lastDisconnect?.error?.output?.statusCode

                if (razon === DisconnectReason.loggedOut) {
                    console.log(
                        chalk.red('🚫 Sesión cerrada o eliminada'),
                        chalk.gray('→ Borra la carpeta auth_info y vuelve a iniciar')
                    )
                    process.exit(1)
                }

                if (this.metodo === '1' && !state.creds.registered) {
                    console.log(chalk.yellow('⏳ Esperando a que completes la vinculación...'))
                    return
                }

                console.log(chalk.yellow('⚠️ Conexión cerrada, reiniciando proceso...'))
                setTimeout(() => this.connect(), 3000)
            }
        })

        // 💾 GUARDAR DATOS DE SESIÓN
        sock.ev.on('creds.update', saveCreds)

        return sock
    }
                  }
