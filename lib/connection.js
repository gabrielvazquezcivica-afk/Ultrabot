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

// Configuración básica
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
        this.conectado = false
    }

    async connect() {
        // Evitamos ejecuciones simultáneas
        if (this.procesando) return
        this.procesando = true

        // Limpiamos recursos anteriores
        this.limpiarRecursos()

        // Creamos carpeta si no existe
        if (!fs.existsSync(this.authFolder)) {
            fs.mkdirSync(this.authFolder, { recursive: true })
        }

        // Cargamos datos de sesión y versión
        const { state, saveCreds } = await useMultiFileAuthState(this.authFolder)
        const { version } = await fetchLatestBaileysVersion()

        // Si ya hay sesión activa, conectamos directamente
        if (state.creds.registered) {
            await this.iniciarConexionSegura(state, saveCreds, version)
            return
        }

        // Interfaz para ingresar datos
        this.rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        })
        this.rl.setMaxListeners(0)

        // Mostramos menú
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

        // Validamos opción elegida
        if (!['1', '2'].includes(this.metodo)) {
            console.log(chalk.red.bold('\n❌ Opción no válida, intenta nuevamente\n'))
            this.rl.close()
            this.procesando = false
            setTimeout(() => this.connect(), 2000)
            return
        }

        // Si eligió método por código numérico
        if (this.metodo === '1') {
            console.log(chalk.blue('\n📝 Ingresa tu número con código de país, ejemplo: 521234567890'))
            console.log(chalk.blue('⚠️ Solo números, sin espacios, signos ni el símbolo +\n'))

            this.numero = await new Promise(respuesta => {
                this.rl.question(
                    chalk.blue('📱 Tu número: '),
                    dato => respuesta(dato.replace(/\D/g, ''))
                )
            })

            // Validamos número ingresado
            if (!this.numero || this.numero.length < 10) {
                console.log(chalk.red.bold('\n❌ Número inválido, revisa e intenta nuevamente\n'))
                this.rl.close()
                this.procesando = false
                setTimeout(() => this.connect(), 2000)
                return
            }
        }

        this.rl.close()

        // Iniciamos conexión con todas las medidas de seguridad
        await this.iniciarConexionSegura(state, saveCreds, version)
    }

    // ✅ Función creada específicamente para evitar el error que te aparece
    async iniciarConexionSegura(state, saveCreds, version) {
        try {
            // Creamos la conexión y COMPROBAMOS que se haya creado bien
            this.sock = makeWASocket({
                version,
                auth: state,
                logger: pino({ level: 'silent' }),
                printQRInTerminal: this.metodo === '2',
                syncFullHistory: false,
                markOnlineOnConnect: true,
                generateHighQualityLinkPreview: false,
                browser: ['Ubuntu', 'Chrome', '128.0.6613.120'],
                connectTimeoutMs: 240000,
                retryDelayMs: 10000,
                keepAliveIntervalMs: 30000,
                emitOwnEvents: false
            })

            // ✅ Comprobación fundamental: Solo seguimos si el objeto existe
            if (!this.sock || typeof this.sock !== 'object' || !this.sock.ev) {
                throw new Error('No se pudo establecer la conexión con los servidores')
            }

            // ───── MANEJO DE EVENTOS ─────
            this.sock.ev.on('creds.update', saveCreds)

            this.sock.ev.on('connection.update', async update => {
                const { connection, qr, lastDisconnect } = update

                // 📱 Mostrar código QR
                if (this.metodo === '2' && qr && !state.creds.registered) {
                    console.log(chalk.yellow('\n📱 Escanea este código QR:\n'))
                    qrcode.generate(qr, { small: true })
                }

                // 🔢 Generar código numérico solo cuando todo está listo y comprobado
                if (
                    this.metodo === '1' &&
                    !state.creds.registered &&
                    this.numero &&
                    !this.codigoGenerado &&
                    connection === 'open'
                ) {
                    try {
                        await new Promise(res => setTimeout(res, 16000))

                        this.codigoGenerado = true
                        this.intento = 0

                        const codigoVinculacion = await this.sock.requestPairingCode(`+${this.numero}`)
                        
                        console.log('\n' + '═'.repeat(50))
                        console.log(chalk.green.bold('✅ CÓDIGO GENERADO CORRECTAMENTE'))
                        console.log(chalk.magenta.bold(`🔑 TU CÓDIGO: ${codigoVinculacion}`))
                        console.log('═'.repeat(50) + '\n')
                        console.log(chalk.blue.bold('📋 PASOS OBLIGATORIOS:'))
                        console.log('1. Ve a: Ajustes → Dispositivos vinculados → Vincular dispositivo')
                        console.log('2. Elige: "Parear con número de teléfono"')
                        console.log('3. Escribe el código COMPLETO, TODO EN MAYÚSCULAS, SIN ESPACIOS')
                        console.log('4. ⏰ TIEMPO LÍMITE: 20 SEGUNDOS, ESCRIBE RÁPIDO')
                        console.log('5. ❌ NO uses VPN, Proxy ni redes modificadas\n')
                        console.log(chalk.yellow.bold('ℹ️ El sistema permanecerá activo esperando tu confirmación\n'))

                    } catch (err) {
                        this.codigoGenerado = false
                        this.intento++

                        if (this.intento < this.maxIntentos) {
                            console.log(chalk.red.bold(`❌ Error al generar: ${err.message}`))
                            console.log(chalk.yellow.bold(`🔁 Reintentando... Intento ${this.intento}/${this.maxIntentos}\n`))
                            setTimeout(() => this.iniciarConexionSegura(state, saveCreds, version), 4000)
                            return
                        }

                        console.log(chalk.red.bold('❌ No se logró generar el código después de varios intentos'))
                        console.log(chalk.yellow.bold('💡 Consejo: Usa la opción con código QR, funciona en todos los casos\n'))
                        this.procesando = false
                        setTimeout(() => this.connect(), 3000)
                        return
                    }
                }

                // ✅ Conexión exitosa
                if (connection === 'open' && !this.codigoGenerado) {
                    console.log(chalk.green.bold('\n✅ CONECTADO EXITOSAMENTE'))
                    console.log(chalk.blue('🤖 El bot está listo para funcionar\n'))
                    this.reiniciarVariables()
                }

                // ❌ Manejo de cierres de conexión
                if (connection === 'close') {
                    const razon = lastDisconnect?.error?.output?.statusCode || lastDisconnect?.error?.message || 'desconocido'

                    if (razon === DisconnectReason.loggedOut || razon === 'logged-out') {
                        console.log(
                            chalk.red('🚫 Sesión cerrada o eliminada'),
                            chalk.gray('→ Borra la carpeta auth_info y vuelve a iniciar')
                        )
                        this.reiniciarVariables()
                        process.exit(1)
                    }

                    // Si ya se generó el código, no reiniciamos nada
                    if (this.metodo === '1' && this.codigoGenerado && !state.creds.registered) {
                        console.log(chalk.yellow('\n⏳ Conexión interrumpida temporalmente, seguimos esperando...\n'))
                        this.procesando = false
                        return
                    }

                    console.log(chalk.red.bold('\n🔌 Desconexión detectada'))
                    console.log(chalk.yellow('♻️ Intentando reconectar...\n'))
                    
                    this.intento++
                    if (this.intento < this.maxIntentos) {
                        setTimeout(() => this.iniciarConexionSegura(state, saveCreds, version), 4000)
                    } else {
                        console.log(chalk.red.bold('❌ No se pudo establecer conexión estable'))
                        this.reiniciarVariables()
                        setTimeout(() => this.connect(), 3000)
                    }
                }
            })

        } catch (error) {
            // ✅ Capturamos el error antes de que se rompa todo
            console.log(chalk.red.bold(`❌ Error del sistema: ${error.message}`))
            console.log(chalk.yellow.bold('🔁 Reinicio automático en 2 segundos...\n'))
            
            this.reiniciarVariables()
            setTimeout(() => this.connect(), 2000)
        }
    }

    // Limpieza de recursos para evitar conflictos
    limpiarRecursos() {
        if (this.sock) {
            try {
                this.sock.ev.removeAllListeners()
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

    // Reiniciar valores para volver a empezar limpio
    reiniciarVariables() {
        this.codigoGenerado = false
        this.procesando = false
        this.intento = 0
        this.metodo = null
        this.numero = null
        this.conectado = false
    }
                }
                      
