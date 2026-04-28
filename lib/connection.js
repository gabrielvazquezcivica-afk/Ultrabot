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
        this.maxIntentos = 3;
        this.codigoMostrado = false;
        this.procesoActivo = false;
    }

    async connect() {
        // Evitamos que se abran varios procesos al mismo tiempo
        if (this.procesoActivo) return;
        this.procesoActivo = true;

        // Reiniciamos valores solo si hemos llegado al límite de intentos
        if (this.intentos >= this.maxIntentos) {
            this.intentos = 0;
            this.codigoMostrado = false;
            this.tipoVinculacion = null;
            this.phoneNumber = null;
            console.log(chalk.red.bold('\n❌ Se agotaron los intentos, empezando el proceso desde el principio...\n'));
            await new Promise(resolve => setTimeout(resolve, 2000));
        }

        console.log(chalk.cyan.bold('====================================='));
        console.log(chalk.cyan.bold('    CONEXIÓN A WHATSAPP - ULTRABOT  '));
        console.log(chalk.cyan.bold('=====================================\n'));

        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });

        // 📌 PASO 1: ELECCIÓN DE MÉTODO
        if (!this.tipoVinculacion) {
            console.log(chalk.yellow.bold('📋 SELECCIONA EL MÉTODO DE VINCULACIÓN:'));
            console.log(chalk.green('🔢 Opción 1: Usar código numérico'));
            console.log(chalk.green('📱 Opción 2: Usar código QR'));
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

        // 📌 PASO 2: INGRESO DE NÚMERO
        if (!this.phoneNumber) {
            console.log(chalk.blue('📝 Ejemplo correcto: Si tu número es +52 33 1234 5678 → escribe: 523312345678'));
            console.log(chalk.blue('⚠️ Solo números, sin signos, espacios, guiones ni paréntesis\n'));

            this.phoneNumber = await new Promise(resolve => {
                rl.question(
                    chalk.blue('📱 Ingresa tu número con código de país: '),
                    num => {
                        const numeroLimpio = num.replace(/\D/g, '');
                        resolve(numeroLimpio);
                    }
                );
            });

            rl.close();

            // Validación mejorada
            if (!this.phoneNumber || this.phoneNumber.length < 11 || this.phoneNumber.length > 15) {
                console.log(chalk.red.bold('❌ El número es inválido. Recuerda que debe incluir código de país y tener entre 11 y 15 dígitos\n'));
                this.phoneNumber = null;
                this.tipoVinculacion = null;
                this.procesoActivo = false;
                return this.connect();
            }

            console.log(chalk.yellow.bold(`⏳ Preparando conexión para: ${this.phoneNumber}\n`));
        }

        // 📌 CREACIÓN DE CONEXIÓN CON CONFIGURACIÓN ESTABLE
        const { state, saveCreds } = await useMultiFileAuthState('./auth_info');

        this.socket = makeWASocket({
            auth: state,
            syncFullHistory: false,
            logger: pino({ level: 'silent' }),
            markAsOnline: true,
            connectTimeoutMs: 120000,
            retryDelayMs: 3000,
            keepAliveIntervalMs: 15000,
            defaultQueryTimeoutMs: 60000
        });

        this.socket.ev.on('creds.update', saveCreds);

        // 📌 MANEJO DE TODOS LOS EVENTOS
        this.socket.ev.on('connection.update', async (actualizacion) => {
            const { connection, qr, code } = actualizacion;

            // ✅ CONEXIÓN EXITOSA
            if (connection === 'open') {
                this.intentos = 0;
                this.codigoMostrado = false;
                this.procesoActivo = false;
                console.log(chalk.green.bold('\n✅ CONEXIÓN ESTABLECIDA CORRECTAMENTE'));
                console.log(chalk.blue(`🤖 Bot funcionando con: ${this.phoneNumber}\n`));
                // Reiniciamos valores para futuras conexiones
                this.phoneNumber = null;
                this.tipoVinculacion = null;
                return;
            }

            // ❌ CONEXIÓN CERRADA
            if (connection === 'close') {
                const razon = actualizacion?.reason;

                // Si cerró sesión definitivamente
                if (razon === DisconnectReason.loggedOut) {
                    console.log(chalk.red.bold('\n❌ Sesión cerrada por completo. Debes volver a vincular.\n'));
                    this.intentos = 0;
                    this.codigoMostrado = false;
                    this.phoneNumber = null;
                    this.tipoVinculacion = null;
                    this.procesoActivo = false;
                    setTimeout(() => this.connect(), 2500);
                    return;
                }

                // Si ya mostramos el código, NO reiniciamos todo, solo esperamos a que se vincule
                if (this.codigoMostrado) {
                    console.log(chalk.yellow.bold('\n⏳ Esperando que ingreses el código... No cierres el proceso\n'));
                    return;
                }

                // Si aún no se generó nada, hacemos intentos controlados
                this.intentos++;
                console.log(chalk.red.bold(`📴 Conexión interrumpida. Intento ${this.intentos} de ${this.maxIntentos}`));
                console.log(chalk.yellow.bold('🔁 Volviendo a intentar...\n'));

                setTimeout(() => {
                    this.procesoActivo = false;
                    this.connect();
                }, 4000);
                return;
            }

            // 🔢 OPCIÓN 1: CÓDIGO NUMÉRICO
            if (this.tipoVinculacion === '1' && !this.codigoMostrado) {
                try {
                    // Esperamos un tiempo prudente antes de solicitar
                    await new Promise(resolve => setTimeout(resolve, 2000));

                    // Si ya viene el código directamente
                    if (code) {
                        this.mostrarCodigo(code);
                        return;
                    }

                    // Si no viene, lo solicitamos nosotros
                    const codigoGenerado = await this.socket.requestPairingCode(this.phoneNumber);
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
                console.log(chalk.yellow('2. Escanea este código\n'));
                console.log(chalk.yellow('⌛ Esperando confirmación...\n'));
            }
        });

        return this.socket;
    }

    // 📌 FUNCIÓN ESPECIAL PARA MOSTRAR CÓDIGO SIN REPETIRLO
    mostrarCodigo(codigo) {
        this.codigoMostrado = true;
        console.log(chalk.magenta.bold(`\n🔑 TU CÓDIGO DE VINCULACIÓN ES: ${chalk.white.bgBlack.bold(` ${codigo} `)}`));
        console.log(chalk.magenta('📋 PASOS PARA VINCULAR:'));
        console.log(chalk.magenta('1. Abre WhatsApp en tu teléfono'));
        console.log(chalk.magenta('2. Ve a Ajustes ➝ Dispositivos vinculados ➝ Vincular dispositivo'));
        console.log(chalk.magenta('3. Selecciona: "Vincular con número de teléfono"'));
        console.log(chalk.magenta('4. Ingresa el código que aparece arriba'));
        console.log(chalk.magenta('⚠️ El código caduca en pocos minutos, úsalo rápido\n'));
        console.log(chalk.green.bold('✅ CÓDIGO GENERADO CORRECTAMENTE. ESPERA MIENTRAS LO INGRESAS...\n'));
    }
            }
