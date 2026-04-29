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

// Configuración para evitar errores
process.setMaxListeners(0)

export default class LibConnection {
    constructor() {
        this.authFolder = './auth_info'
        this.metodo = null
        this.numero = null
        this.codigoGenerado = false // 🚩 Bandera para evitar códigos duplicados
        this.procesando = false // 🚩 Evita procesos al mismo tiempo
    }

    async connect() {
        // Si ya está corriendo, no hacemos nada
        if (this.procesando) return
        this.procesando = true

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

        // Menú principal
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
                this.procesando = false
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
            browser: ['Ubuntu', 'Chrome', '125.0.6422.141'], // ✅ Navegador actualizado
            connectTimeoutMs: 180000,
            retryDelayMs: 15000
        })

        // ───── MANEJO DE EVENTOS ─────
        sock.ev.on('connection.update', async update => {
            const { connection, qr, lastDisconnect } = update

            // 📱 MOSTRAR CÓDIGO QR
            if (this.metodo === '2' && qr && !state.creds.registered) {
                console.log(chalk.yellow('\n📱 Escanea este código QR:\n'))
                qrcode.generate(qr, { small: true })
            }

            // 🔢 GENERAR SOLO UN CÓDIGO VÁLIDO
            if (
                this.metodo === '1' && 
                !state.creds.registered && 
                this.numero && 
                !this.codigoGenerado // ✅ Solo si no se ha generado antes
            ) {
                // ⏱️ TIEMPO EXACTO que requiere WhatsApp para aceptar la solicitud
                await new Promise(res => setTimeout(res, 18000))

                try {
                    this.codigoGenerado = true // Bloqueamos para que no vuelva a generar

                    // ✅ Formato correcto obligatorio
                    const codigoVinculacion = await sock.requestPairingCode(`+${this.numero}`)
                    
                    console.log('\n' + '═'.repeat(50))
                    console.log(chalk.green.bold('✅ CÓDIGO GENERADO CORRECTAMENTE'))
                    console.log(chalk.magenta.bold(`🔑 TU CÓDIGO: ${codigoVinculacion}`))
                    console.log('═'.repeat(50) + '\n')
                    console.log(chalk.blue.bold('📋 PASOS OBLIGATORIOS:'))
                    console.log('1. Ve a: Ajustes → Dispositivos vinculados → Vincular dispositivo')
                    console.log('2. Elige: "Vincular con número de teléfono"')
                    console.log('3. Escribe el código COMPLETO, TODO EN MAYÚSCULAS, SIN ESPACIOS')
                    console.log('4. ⏰ TIEMPO LÍMITE: 20 SEGUNDOS, ESCRIBE RÁPIDO')
                    console.log('5. ❌ NO uses VPN, ni Proxy, ni redes extrañas, usa tu conexión normal\n')
                    console.log(chalk.yellow.bold('ℹ️ Si te dice inválido: intenta de nuevo, a veces WhatsApp tarda en procesar\n'))

                } catch (err) {
                    console.log(chalk.red.bold(`❌ No se pudo generar el código: ${err.message}`))
                    this.codigoGenerado = false // Permitimos intentar de nuevo
                    this.procesando = false
                    setTimeout(() => this.connect(), 3000)
                    return
                }
            }

            // ✅ CUANDO SE CONECTA CORRECTAMENTE
            if (connection === 'open') {
                console.log(chalk.green.bold('\n✅ CONECTADO EXITOSAMENTE'))
                console.log(chalk.blue('🤖 El bot está listo para funcionar\n'))
                // Reiniciamos todo para próxima vez
                this.codigoGenerado = false
                this.procesando = false
                this.metodo = null
                this.numero = null
            }

            // ❌ CUANDO SE CIERRA LA CONEXIÓN
            if (connection === 'close') {
                const razon = lastDisconnect?.error?.output?.statusCode

                if (razon === DisconnectReason.loggedOut) {
                    console.log(
                        chalk.red('🚫 Sesión cerrada o eliminada'),
                        chalk.gray('→ Borra la carpeta auth_info y vuelve a iniciar')
                    )
                    this.codigoGenerado = false
                    this.procesando = false
                    process.exit(1)
                }

                // ⏳ Si ya mostramos código, solo esperamos, NO reiniciamos ni generamos nada más
                if (this.metodo === '1' && this.codigoGenerado && !state.creds.registered) {
                    console.log(chalk.yellow('\n⏳ Esperando a que ingreses el código... No se generará otro\n'))
                    return
                }

                console.log(chalk.yellow('⚠️ Conexión interrumpida, intentando nuevamente...'))
                this.codigoGenerado = false
                this.procesando = false
                setTimeout(() => this.connect(), 5000)
            }
        })

        // 💾 GUARDAR DATOS DE SESIÓN
        sock.ev.on('creds.update', saveCreds)

        return sock
    }
              }
