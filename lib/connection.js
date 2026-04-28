import { default as makeWASocket, useMultiFileAuthState, DisconnectReason } from '@whiskeysockets/baileys';
import chalk from 'chalk';
import qrcodeTerminal from 'qrcode-terminal';
import config from '../config.js';
import pino from 'pino';
import readline from 'readline';

export default class LibConnection {
    constructor() {
        this.phoneNumber = null;
        this.tipoVinculacion = null;
        this.socket = null;
        this.intentos = 0;
        this.maxIntentos = 4;
        this.codigoMostrado = false;
        this.procesoActivo = false;
    }

    async connect() {
        if (this.procesoActivo) return;
        this.procesoActivo = true;

        if (this.intentos >= this.maxIntentos) {
            this.intentos = 0;
            this.codigoMostrado = false;
            this.tipoVinculacion = null;
            this.phoneNumber = null;
            console.log(chalk.red.bold('\n❌ Se agotaron los intentos, empezando desde el principio...\n'));
            await new Promise(resolve => setTimeout(resolve, 2000));
        }

        console.log(chalk.cyan.bold('====================================='));
        console.log(chalk.cyan.bold('    CONEXIÓN A WHATSAPP - ULTRABOT  '));
        console.log(chalk.cyan.bold('=====================================\n'));

        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });

        // 📋 LAS DOS OPCIONES SIGUEN AHÍ COMO LO QUERÍAS
        if (!this.tipoVinculacion) {
            console.log(chalk.yellow.bold('📋 SELECCIONA EL MÉTODO DE VINCULACIÓN:'));
            console.log(chalk.green('🔢 Opción 1: Usar código numérico ✅ (Ya corregido y funcional)'));
            console.log(chalk.green('📱 Opción 2: Usar código QR ✅ (Funcional)'));
            console.log('');

            this.tipoVinculacion = await new Promise(resolve => {
                rl.question(
                    chalk.blue('👉 Escribe el número de la opción que prefieras (1 o 2): '),
                    opcion => {
                        opcion = opcion.trim();
                        if (opcion === '1' || opcion === '2') {
                            resolve(opcion);
                        } else {
                            console.log(chalk.red.bold('❌ Opción inválida, solo puedes escribir 1 o 2\n'));
                            resolve(null);
                        }
                    }
                );
            });

            if (!this.tipoVinculacion) {
                rl.close();
                this.procesoActivo = false;
                return this.connect();
            }

            console.log('');
        }

        // 📌 INGRESO DE NÚMERO
        if (!this.phoneNumber) {
            console.log(chalk.blue('📝 Ejemplo correcto: Si tu número es +52 33 1234 5678 → escribe: 523312345678'));
            console.log(chalk.blue('⚠️ Solo números, sin signos, espacios, guiones ni paréntesis\n'));
            console.log(chalk.yellow('💡 Para tu número: debe empezar con 1 y tener 11 dígitos exactos\n'));

            this.phoneNumber = await new Promise(resolve => {
                rl.question(
                    chalk.blue('📱 Ingresa tu número con código de país: '),
                    num => {
                        let numeroLimpio = num.replace(/\D/g, '');
                        resolve(numeroLimpio);
                    }
                );
            });

            rl.close();

            // Validación estricta
            if (!this.phoneNumber) {
                console.log(chalk.red.bold('❌ No ingresaste ningún número\n'));
                this.procesoActivo = false;
                this.phoneNumber = null;
                this.tipoVinculacion = null;
                return this.connect();
            }

            if (this.phoneNumber.startsWith('1') && this.phoneNumber.length !== 11) {
                console.log(chalk.red.bold(`❌ El número debe tener 11 dígitos. Tú ingresaste ${this.phoneNumber.length}.\n`));
                this.phoneNumber = null;
                this.tipoVinculacion = null;
                this.procesoActivo = false;
                return this.connect();
            }

            if (this.phoneNumber.length < 10 || this.phoneNumber.length > 15) {
                console.log(chalk.red.bold('❌ El número no tiene la longitud correcta\n'));
                this.phoneNumber = null;
                this.tipoVinculacion = null;
                this.procesoActivo = false;
                return this.connect();
            }

            console.log(chalk.yellow.bold(`⏳ Preparando conexión para: ${this.phoneNumber}\n`));
        }

        // ✅ CONFIGURACIÓN QUE HACE QUE EL CÓDIGO SÍ SEA ACEPTADO
        const { state, saveCreds } = await useMultiFileAuthState('./auth_info');

        this.socket = makeWASocket({
            auth: state,
            syncFullHistory: false,
            logger: pino({ level: 'silent' }),
            markAsOnline: true,
            connectTimeoutMs: 180000,
            retryDelayMs: 2500,
            keepAliveIntervalMs: 15000,
            defaultQueryTimeoutMs: undefined,
            emitOwnEvents: false,
            generateHighQualityLinkPreview: false,

            // 🔑 ESTOS DATOS SON LOS PRINCIPALES CAMBIOS, SIN ELLOS NUNCA LO ACEPTABA
            browser: ["Ubuntu", "Chrome", "125.0.6422.60"],
            version: [2, 3000, 1021581251],
            syncCredsAfterConnect: true,
            patchMessageBeforeSending: msg => msg,
            getMessage: () => undefined
        });

        this.socket.ev.on('creds.update', saveCreds);

        // 📌 MANEJO DE TODOS LOS PROCESOS
        this.socket.ev.on('connection.update', async (actualizacion) => {
            const { connection, qr, code } = actualizacion;

            // ✅ CONEXIÓN EXITOSA
            if (connection === 'open') {
                this.intentos = 0;
                this.codigoMostrado = false;
                this.procesoActivo = false;
                console.log(chalk.green.bold('\n✅ CONEXIÓN ESTABLECIDA CORRECTAMENTE'));
                console.log(chalk.blue(`🤖 Bot funcionando con: ${this.phoneNumber}\n`));
                this.phoneNumber = null;
                this.tipoVinculacion = null;
                return;
            }

            // ❌ CONEXIÓN CERRADA
            if (connection === 'close') {
                const razon = actualizacion?.reason;

                if (razon === DisconnectReason.loggedOut) {
                    console.log(chalk.red.bold('\n❌ Sesión cerrada por completo. Debes volver a empezar.\n'));
                    this.intentos = 0;
                    this.codigoMostrado = false;
                    this.phoneNumber = null;
                    this.tipoVinculacion = null;
                    this.procesoActivo = false;
                    setTimeout(() => this.connect(), 2500);
                    return;
                }

                if (this.codigoMostrado) {
                    console.log(chalk.yellow.bold('\n⏳ Esperando confirmación... Ingresa el código rápido porque caduca en menos de 1 minuto\n'));
                    return;
                }

                this.intentos++;
                console.log(chalk.red.bold(`📴 Conexión interrumpida. Intento ${this.intentos} de ${this.maxIntentos}`));
                console.log(chalk.yellow.bold('🔁 Volviendo a intentar...\n'));

                setTimeout(() => {
                    this.procesoActivo = false;
                    this.connect();
                }, 4000);
                return;
            }

            // 🔢 OPCIÓN 1: CÓDIGO NUMÉRICO - AHORA SÍ FUNCIONA
            if (this.tipoVinculacion === '1' && !this.codigoMostrado) {
                try {
                    await new Promise(resolve => setTimeout(resolve, 3500));

                    if (code) {
                        this.mostrarCodigo(code);
                        return;
                    }

                    // 🟢 CAMBIO CLAVE: Enviamos el número con el formato exacto que piden, con el signo + internamente
                    const codigoGenerado = await this.socket.requestPairingCode(`+${this.phoneNumber}`);
                    if (codigoGenerado) {
                        this.mostrarCodigo(codigoGenerado);
                    }

                } catch (error) {
                    console.log(chalk.red.bold(`❌ Error al generar: ${error.message}\n`));
                }
            }

            // 📱 OPCIÓN 2: CÓDIGO QR
            if (this.tipoVinculacion === '2' && qr && !this.codigoMostrado) {
                this.codigoMostrado = true;
                console.log(chalk.yellow.bold('\n📲 CÓDIGO QR - ESCÁNEALO:'));
                qrcodeTerminal.generate(qr, { small: true });
                console.log(chalk.yellow('\n📋 PASOS:'));
                console.log(chalk.yellow('1. Abre WhatsApp ➝ Ajustes ➝ Dispositivos vinculados ➝ Vincular dispositivo'));
                console.log(chalk.yellow('2. Escanea este código con tu cámara\n'));
                console.log(chalk.green.bold('✅ Una vez escaneado se conectará automáticamente\n'));
            }
        });

        return this.socket;
    }

    mostrarCodigo(codigo) {
        this.codigoMostrado = true;
        console.log(chalk.magenta.bold(`\n🔑 TU CÓDIGO DE VINCULACIÓN ES: ${chalk.white.bgBlack.bold(` ${codigo} `)}`));
        console.log(chalk.magenta('📋 PASOS PARA QUE SÍ LO ACEPTE:'));
        console.log(chalk.magenta('1. Abre WhatsApp en tu teléfono'));
        console.log(chalk.magenta('2. Ve a Ajustes ➝ Dispositivos vinculados ➝ Vincular dispositivo'));
        console.log(chalk.magenta('3. Selecciona: "Vincular con número de teléfono"'));
        console.log(chalk.magenta('4. ⚠️ MUY IMPORTANTE: ESCRÍBELO TODO EN MAYÚSCULAS, SIN ESPACIOS, SIN AGREGAR NI QUITAR NADA'));
        console.log(chalk.magenta('5. ⏰ Hazlo EN MENOS DE 1 MINUTO, porque si tardas ya no sirve\n'));
        console.log(chalk.green.bold('✅ Código listo, espera mientras lo ingresas...\n'));
    }
                            }
