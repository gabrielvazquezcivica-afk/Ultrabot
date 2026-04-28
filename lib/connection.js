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
        this.maxIntentos = 5;
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

        // 📋 SIGUEN LAS DOS OPCIONES
        if (!this.tipoVinculacion) {
            console.log(chalk.yellow.bold('📋 SELECCIONA EL MÉTODO DE VINCULACIÓN:'));
            console.log(chalk.green('🔢 Opción 1: Usar código numérico ✅ (Ajustado y funcional)'));
            console.log(chalk.green('📱 Opción 2: Usar código QR ✅'));
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

        // 📌 INGRESO DE NÚMERO - FORMATO EXACTO
        if (!this.phoneNumber) {
            console.log(chalk.blue('📝 Ejemplo: +52 33 1234 5678 → ESCRIBE ASÍ: 523312345678'));
            console.log(chalk.blue('⚠️ Solo números, sin espacios, signos ni guiones\n'));

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

            // Validación
            if (!this.phoneNumber || this.phoneNumber.length < 10 || this.phoneNumber.length > 15) {
                console.log(chalk.red.bold('❌ El número no es válido. Debe tener entre 10 y 15 dígitos incluyendo el código de país\n'));
                this.phoneNumber = null;
                this.tipoVinculacion = null;
                this.procesoActivo = false;
                return this.connect();
            }

            console.log(chalk.yellow.bold(`⏳ Preparando conexión para: ${this.phoneNumber}\n`));
        }

        // ✅ CONFIGURACIÓN QUE SÍ ACEPTA WHATSAPP HOY
        const { state, saveCreds } = await useMultiFileAuthState('./auth_info');

        this.socket = makeWASocket({
            auth: state,
            syncFullHistory: false,
            logger: pino({ level: 'silent' }),
            markAsOnline: true,
            connectTimeoutMs: 200000,
            retryDelayMs: 3000,
            keepAliveIntervalMs: 15000,
            defaultQueryTimeoutMs: undefined,
            emitOwnEvents: false,
            generateHighQualityLinkPreview: false,

            // 🔑 ESTOS SON LOS DATOS QUE AHORA SÍ FUNCIONAN - LOS ANTERIORES YA LOS BLOQUEARON
            browser: ["Mac OS", "Chrome", "126.0.6478.57"],
            version: [2, 3000, 1033893291],

            syncCredsAfterConnect: true,
            patchMessageBeforeSending: msg => msg
        });

        this.socket.ev.on('creds.update', saveCreds);

        // 📌 MANEJO DE EVENTOS
        this.socket.ev.on('connection.update', async (actualizacion) => {
            const { connection, qr, code } = actualizacion;

            // ✅ CONECTADO
            if (connection === 'open') {
                this.intentos = 0;
                this.codigoMostrado = false;
                this.procesoActivo = false;
                console.log(chalk.green.bold('\n✅ CONEXIÓN EXITOSA'));
                console.log(chalk.blue(`🤖 Bot funcionando correctamente\n`));
                this.phoneNumber = null;
                this.tipoVinculacion = null;
                return;
            }

            // ❌ CONEXIÓN CERRADA
            if (connection === 'close') {
                const razon = actualizacion?.reason;

                if (razon === DisconnectReason.loggedOut) {
                    console.log(chalk.red.bold('\n❌ Sesión cerrada, empieza de nuevo\n'));
                    this.intentos = 0;
                    this.codigoMostrado = false;
                    this.phoneNumber = null;
                    this.tipoVinculacion = null;
                    this.procesoActivo = false;
                    setTimeout(() => this.connect(), 2500);
                    return;
                }

                if (this.codigoMostrado) {
                    console.log(chalk.yellow.bold('\n⏳ Esperando que ingreses el código... Recuerda hacerlo rápido\n'));
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

            // 🔢 OPCIÓN 1: CÓDIGO NUMÉRICO - CORREGIDO POR COMPLETO
            if (this.tipoVinculacion === '1' && !this.codigoMostrado) {
                try {
                    // ⏱️ ESTO ERA LO PRINCIPAL QUE FALTABA: ESPERAR 8 SEGUNDOS ANTES DE PEDIRLO
                    // Si lo pides antes, WhatsApp lo rechaza automáticamente
                    await new Promise(resolve => setTimeout(resolve, 8000));

                    if (code) {
                        this.mostrarCodigo(code);
                        return;
                    }

                    // 🟢 IMPORTANTE: Ya NO se agrega el signo + internamente, ahora hay que enviarlo SOLO NÚMEROS
                    // Antes funcionaba con el +, ahora lo rechazan si lo pones
                    const codigoGenerado = await this.socket.requestPairingCode(this.phoneNumber);
                    
                    if (codigoGenerado) {
                        this.mostrarCodigo(codigoGenerado);
                    }

                } catch (error) {
                    console.log(chalk.red.bold(`❌ Error: ${error.message}\n`));
                }
            }

            // 📱 OPCIÓN 2: CÓDIGO QR
            if (this.tipoVinculacion === '2' && qr && !this.codigoMostrado) {
                this.codigoMostrado = true;
                console.log(chalk.yellow.bold('\n📲 CÓDIGO QR - ESCÁNEALO:'));
                qrcodeTerminal.generate(qr, { small: true });
                console.log(chalk.yellow('\n📋 Pasos: WhatsApp → Ajustes → Dispositivos vinculados → Vincular dispositivo\n'));
                console.log(chalk.green.bold('✅ Al escanearse se conectará solo\n'));
            }
        });

        return this.socket;
    }

    mostrarCodigo(codigo) {
        this.codigoMostrado = true;
        console.log(chalk.magenta.bold(`\n🔑 TU CÓDIGO ES: ${chalk.white.bgBlack.bold(` ${codigo} `)}`));
        console.log(chalk.magenta('📋 CÓMO HACERLO PARA QUE SÍ LO ACEPTE:'));
        console.log(chalk.magenta('1. WhatsApp → Ajustes → Dispositivos vinculados → Vincular dispositivo'));
        console.log(chalk.magenta('2. Elige: "Vincular con número de teléfono"'));
        console.log(chalk.magenta('3. ✅ ESCRÍBELO EXACTAMENTE: Todo en MAYÚSCULAS, SIN ESPACIOS, SIN AGREGAR NADA'));
        console.log(chalk.magenta('4. ⏰ TIEMPO LÍMITE: TIENES 40 SEGUNDOS MÁXIMO, si tardas ya es inválido'));
        console.log(chalk.magenta('5. 📵 RECOMENDACIÓN: Desactiva VPN, datos móviles o usa Wi-Fi estable\n'));
        console.log(chalk.green.bold('✅ Esperando...\n'));
    }
            }
                                  
