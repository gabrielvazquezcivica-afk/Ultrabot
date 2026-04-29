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

// Configuración para evitar errores y problemas de eventos
process.setMaxListeners(0)

export default class LibConnection {
    constructor() {
        this.authFolder = './auth_info'
        this.metodo = null
        this.numero = null
        this.codigoGenerado = false
        this.procesando = false
        this.intento = 0
        this.maxIntentos = 3
        this.sock = null
        this.rl = null
    }

    async connect() {
        if (this.procesando) return
        this.procesando = true

        if (!fs.existsSync(this.authFolder)) {
            fs.mkdirSync(this.authFolder, { recursive: true })
        }

        // Si ya hay una conexión activa, la cerramos limpiamente antes de empezar
        if (this.sock) {
            try {
                this.sock.ev.removeAllListeners()
                this.sock.end(undefined)
            } catch {}
            this.sock = null
        }

        const { state, saveCreds } = await useMultiFileAuthState(this.authFolder)
        const { version } = await fetchLatestBaileysVersion()

        // Si ya tenemos sesión iniciada, no mostramos el menú
        if (state.creds.registered) {
            await this.iniciarConexion(state, saveCreds, version)
            return
        }

        // Limpiamos y preparamos entrada de datos
        if (this.rl) {
            try {
                this.rl.close()
                this.rl.removeAllListeners()
            } catch {}
        }

        this.rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        })
        this.rl.setMaxListeners(0)

        // Menú principal
        console.log(chalk.cyan.bold('====================================='))
        console.log(chalk.cyan.bold('    CONEXIÓN A WHATSAPP - ULTRABOT  '))
        console.log(chalk.cyan.bold('=====================================\n'))
        console.log(chalk.yellow.bold('📋 SELECCIONA EL MÉTODO DE VINCULACIÓN:'))
        console.log(chalk.green('🔢 Opción 1: Usar código numérico'))
        console.log(chalk.green('📱 Opción 2: Usar código QR\n'))

        this.metodo = await new Promise(respuesta => {
            this.rl.question(
                chalk.blue('👉 Escribe el número de la opción (1 o 2): '),
                dato => respuesta(dato.trim())
            )
        })

        if (!['1', '2'].includes(this.metodo)) {
            console.log(chalk.red.bold('\n❌ Opción no válida, intenta nuevamente\n'))
            this.rl.close()
            this.procesando = false
            setTimeout(() => this.connect(), 2000)
            return
        }

        if (this.metodo === '1') {
            console.log(chalk.blue('\n📝 Ingresa tu número con código de país, ejemplo: 521234567890'))
            console.log(chalk.blue('⚠️ Solo números, sin espacios, signos ni el símbolo +\n'))

            this.numero = await new Promise(respuesta => {
                this.rl.question(
                    chalk.blue('📱 Tu número: '),
                    dato => respuesta(dato.replace(/\D/g, ''))
                )
            })

            if (!this.numero || this.numero.length < 10) {
                console.log(chalk.red.bold('\n❌ Número inválido, revisa e intenta nuevamente\n'))
                this.rl.close()
                this.procesando = false
                setTimeout(() => this.connect(), 2000)
                return
            }
        }

        this.rl.close()

        await this.iniciarConexion(state, saveCreds, version)
    }

    async iniciarConexion(state, saveCreds, version) {
        this.sock = makeWASocket({
            version,
            auth: state,
            logger: pino({ level: 'silent' }),
            printQRInTerminal: this.metodo === '2',
            syncFullHistory: false,
            markOnlineOnConnect: true,
            generateHighQualityLinkPreview: false,
            browser: ['Ubuntu', 'Chrome', '126.0.6478.127'],
            connectTimeoutMs: 240000,
            retryDelayMs: 10000,
            keepAliveIntervalMs: 30000,
            emitOwnEvents: false
        })

        // ───── MANEJO DE EVENTOS ─────
        this.sock.ev.on('connection.update', async update => {
            const { connection, qr, lastDisconnect } = update

            // 📱 MOSTRAR CÓDIGO QR
            if (this.metodo === '2' && qr && !state.creds.registered) {
                console.log(chalk.yellow('\n📱 Escanea este código QR:\n'))
                qrcode.generate(qr, { small: true })
            }

            // 🔢 GENERAR CÓDIGO NUMÉRICO SOLO CUANDO ESTÁ TODO LISTO
            if (
                this.metodo === '1' &&
                !state.creds.registered &&
                this.numero &&
                !this.codigoGenerado &&
                connection === 'open' // ✅ SOLO GENERA SI LA CONEXIÓN ESTÁ REALMENTE ABIERTA
            ) {
                try {
                    // ⏱️ TIEMPO CORRECTO Y SUFICIENTE
                    await new Promise(res => setTimeout(res, 15000))

                    this.codigoGenerado = true
                    this.intento = 0

                    const codigoVinculacion = await this.sock.requestPairingCode(`+${this.numero}`)
                    
                    console.log('\n' + '═'.repeat(50))
                    console.log(chalk.green.bold('✅ CÓDIGO GENERADO CORRECTAMENTE'))
                    console.log(chalk.magenta.bold(`🔑 TU CÓDIGO: ${codigoVinculacion}`))
                    console.log('═'.repeat(50) + '\n')
                    console.log(chalk.blue.bold('📋 PASOS OBLIGATORIOS:'))
                    console.log('1. Ve a: Ajustes → Dispositivos vinculados → Vincular dispositivo')
                    console.log('2. Elige: "Vincular con número de teléfono"')
                    console.log('3. Escribe el código COMPLETO, TODO EN MAYÚSCULAS, SIN ESPACIOS')
                    console.log('4. ⏰ TIEMPO LÍMITE: 20 SEGUNDOS, ESCRIBE RÁPIDO')
                    console.log('5. ❌ NO uses VPN, Proxy ni redes modificadas, usa tu conexión normal\n')
                    console.log(chalk.yellow.bold('ℹ️ El sistema permanecerá esperando, no se cerrará ni reiniciará\n'))

                } catch (err) {
                    this.codigoGenerado = false
                    this.intento++

                    if (this.intento < this.maxIntentos) {
                        console.log(chalk.red.bold(`❌ Error al generar, intento ${this.intento}/${this.maxIntentos}: ${err.message}`))
                        console.log(chalk.yellow.bold('🔁 Volviendo a intentar en 5 segundos...\n'))
                        setTimeout(() => this.iniciarConexion(state, saveCreds, version), 5000)
                        return
                    }

                    console.log(chalk.red.bold('❌ No se pudo generar el código después de varios intentos'))
                    console.log(chalk.yellow.bold('💡 Recomendación: Prueba usando la opción de Código QR, es más estable\n'))
                    this.procesando = false
                    setTimeout(() => this.connect(), 3000)
                    return
                }
            }

            // ✅ CUANDO SE CONECTA CORRECTAMENTE
            if (connection === 'open' && !this.codigoGenerado) {
                console.log(chalk.green.bold('\n✅ CONECTADO EXITOSAMENTE'))
                console.log(chalk.blue('🤖 El bot está listo para funcionar\n'))
                this.codigoGenerado = false
                this.procesando = false
                this.intento = 0
                this.metodo = null
                this.numero = null
            }

            // ❌ MANEJO DE CIERRE DE CONEXIÓN
            if (connection === 'close') {
                const razon = lastDisconnect?.error?.output?.statusCode || lastDisconnect?.error?.message

                // Si cerró por sesión terminada
                if (razon === DisconnectReason.loggedOut || razon === 'logged-out') {
                    console.log(
                        chalk.red('🚫 Sesión cerrada o eliminada'),
                        chalk.gray('→ Borra la carpeta auth_info y vuelve a iniciar')
                    )
                    this.codigoGenerado = false
                    this.procesando = false
                    this.intento = 0
                    process.exit(1)
                }

                // ✅ SI YA SE MOSTRÓ EL CÓDIGO, NO REINICIAMOS, SOLO ESPERAMOS
                if (this.metodo === '1' && this.codigoGenerado && !state.creds.registered) {
                    console.log(chalk.yellow('\n⏳ Conexión interrumpida temporalmente, pero seguimos esperando...\n'))
                    this.procesando = false
                    return
                }

                // Si se cerró antes de generar, reintentamos
                console.log(chalk.red.bold('\n🔌 Desconexión detectada'))
                console.log(chalk.yellow('♻️ Intentando restablecer conexión...\n'))
                this.codigoGenerado = false
                this.procesando = false
                this.intento++
                
                if (this.intento < this.maxIntentos) {
                    setTimeout(() => this.iniciarConexion(state, saveCreds, version), 4000)
                } else {
                    console.log(chalk.red.bold('❌ No se pudo establecer conexión después de varios intentos'))
                    this.intento = 0
                    setTimeout(() => this.connect(), 3000)
                }
            }
        })

        // 💾 GUARDAR DATOS DE SESIÓN
        this.sock.ev.on('creds.update', saveCreds)

        return this.sock
    }
              }
                      
