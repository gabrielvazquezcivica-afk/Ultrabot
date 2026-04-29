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

        this.limpiarTodo()

        if (!fs.existsSync(this.authFolder)) {
            fs.mkdirSync(this.authFolder, { recursive: true })
        }

        const { state, saveCreds } = await useMultiFileAuthState(this.authFolder)
        const { version } = await fetchLatestBaileysVersion()

        if (state.creds.registered) {
            await this.conectar(state, saveCreds, version)
            return
        }

        this.rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        })
        this.rl.setMaxListeners(0)

        console.log(chalk.cyan.bold('====================================='))
        console.log(chalk.cyan.bold('    CONEXIÓN A WHATSAPP - ULTRABOT  '))
        console.log(chalk.cyan.bold('=====================================\n'))
        console.log(chalk.yellow.bold('📋 SELECCIONA EL MÉTODO DE VINCULACIÓN:'))
        console.log(chalk.green('🔢 Opción 1: Usar código numérico'))
        console.log(chalk.green('📱 Opción 2: Usar código QR\n'))

        this.metodo = await new Promise(resp => {
            this.rl.question(
                chalk.blue('👉 Escribe el número de la opción (1 o 2): '),
                dato => resp(dato.trim())
            )
        })

        if (!['1', '2'].includes(this.metodo)) {
            console.log(chalk.red.bold('\n❌ Opción no válida\n'))
            this.rl.close()
            this.procesando = false
            setTimeout(() => this.connect(), 2000)
            return
        }

        if (this.metodo === '1') {
            console.log(chalk.blue('\n📝 Ingresa tu número con código de país, ejemplo: 521234567890'))
            console.log(chalk.blue('⚠️ Solo números, sin espacios ni signos\n'))

            this.numero = await new Promise(resp => {
                this.rl.question(
                    chalk.blue('📱 Tu número: '),
                    dato => resp(dato.replace(/\D/g, ''))
                )
            })

            if (!this.numero || this.numero.length < 10) {
                console.log(chalk.red.bold('\n❌ Número incorrecto\n'))
                this.rl.close()
                this.procesando = false
                setTimeout(() => this.connect(), 2000)
                return
            }
        }

        this.rl.close()

        await this.conectar(state, saveCreds, version)
    }

    async conectar(state, saveCreds, version) {
        try {
            // Creamos la conexión correctamente
            this.sock = makeWASocket({
                version: version,
                auth: state,
                logger: pino({ level: 'silent' }),
                printQRInTerminal: this.metodo === '2',
                syncFullHistory: false,
                markOnlineOnConnect: true,
                generateHighQualityLinkPreview: false,
                browser: ['Ubuntu', 'Chrome', '126.0.6478.186'],
                connectTimeoutMs: 200000,
                retryDelayMs: 12000,
                keepAliveIntervalMs: 30000,
                emitOwnEvents: true
            })

            // ✅ SOLUCIÓN CLAVE: Esperamos hasta que el objeto y sus propiedades existan
            let intentoEspera = 0
            while (!this.sock?.ev && intentoEspera < 20) {
                await new Promise(res => setTimeout(res, 300))
                intentoEspera++
            }

            // Si después de esperar sigue sin existir, lanzamos error controlado
            if (!this.sock || !this.sock.ev) {
                throw new Error('No se pudo inicializar la conexión con los servidores')
            }

            // Ahora sí usamos las propiedades porque ya estamos seguros de que existen
            this.sock.ev.on('creds.update', saveCreds)

            this.sock.ev.on('connection.update', async ({ connection, qr, lastDisconnect }) => {

                if (this.metodo === '2' && qr && !state.creds.registered) {
                    console.log(chalk.yellow('\n📱 Escanea este código QR:\n'))
                    qrcode.generate(qr, { small: true })
                }

                if (
                    this.metodo === '1' &&
                    !state.creds.registered &&
                    this.numero &&
                    !this.codigoGenerado &&
                    connection === 'open'
                ) {
                    try {
                        await new Promise(res => setTimeout(res, 15000))

                        this.codigoGenerado = true

                        const codigo = await this.sock.requestPairingCode(`+${this.numero}`)

                        console.log('\n' + '═'.repeat(50))
                        console.log(chalk.green.bold('✅ CÓDIGO GENERADO CORRECTAMENTE'))
                        console.log(chalk.magenta.bold(`🔑 TU CÓDIGO: ${codigo}`))
                        console.log('═'.repeat(50) + '\n')
                        console.log(chalk.blue.bold('📋 PASOS:'))
                        console.log('1. Ajustes → Dispositivos vinculados → Vincular dispositivo')
                        console.log('2. Elige: "Vincular con número de teléfono"')
                        console.log('3. Escribe todo el código, sin espacios y en mayúsculas')
                        console.log('4. ⏰ Tienes solo 20 segundos para hacerlo')
                        console.log('5. No uses VPN ni redes extrañas\n')

                    } catch (err) {
                        this.codigoGenerado = false
                        this.intento++

                        if (this.intento < this.maxIntentos) {
                            console.log(chalk.red.bold(`❌ Error al generar: ${err.message}`))
                            console.log(chalk.yellow.bold(`🔁 Intento ${this.intento}/${this.maxIntentos}\n`))
                            setTimeout(() => this.conectar(state, saveCreds, version), 4000)
                            return
                        }

                        console.log(chalk.red.bold('❌ No se pudo generar después de varios intentos'))
                        console.log(chalk.yellow.bold('💡 Usa la opción de código QR, esa siempre funciona\n'))
                        this.procesando = false
                        setTimeout(() => this.connect(), 3000)
                        return
                    }
                }

                if (connection === 'open' && !this.codigoGenerado) {
                    console.log(chalk.green.bold('\n✅ CONECTADO EXITOSAMENTE'))
                    console.log(chalk.blue('🤖 Bot listo para usar\n'))
                    this.reiniciar()
                }

                if (connection === 'close') {
                    const razon = lastDisconnect?.error?.output?.statusCode || lastDisconnect?.error?.message

                    if (razon === DisconnectReason.loggedOut || razon === 'logged-out') {
                        console.log(chalk.red('🚫 Sesión cerrada. Borra la carpeta auth_info'))
                        this.reiniciar()
                        process.exit(1)
                    }

                    if (this.metodo === '1' && this.codigoGenerado && !state.creds.registered) {
                        console.log(chalk.yellow('\n⏳ Esperando que ingreses el código...\n'))
                        this.procesando = false
                        return
                    }

                    console.log(chalk.red.bold('\n🔌 Desconexión detectada'))
                    this.intento++

                    if (this.intento < this.maxIntentos) {
                        console.log(chalk.yellow('♻️ Intentando reconectar...\n'))
                        setTimeout(() => this.conectar(state, saveCreds, version), 4000)
                    } else {
                        console.log(chalk.red.bold('❌ No se pudo conectar'))
                        this.reiniciar()
                        setTimeout(() => this.connect(), 3000)
                    }
                }
            })

        } catch (error) {
            console.log(chalk.red.bold(`❌ Error del sistema: ${error.message}`))
            console.log(chalk.yellow.bold('🔁 Reinicio automático en 2 segundos...\n'))
            this.reiniciar()
            setTimeout(() => this.connect(), 2000)
        }
    }

    limpiarTodo() {
        if (this.sock) {
            try {
                this.sock.ev?.removeAllListeners()
                this.sock.end?.()
            } catch {}
            this.sock = null
        }

        if (this.rl) {
            try {
                this.rl.close()
                this.rl.removeAllListeners()
            } catch {}
            this.rl = null
        }
    }

    reiniciar() {
        this.codigoGenerado = false
        this.procesando = false
        this.intento = 0
        this.metodo = null
        this.numero = null
    }
                                    }
              
