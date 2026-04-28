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

        // 📌 PASO 2: INGRESO Y PROCESAMIENTO CORRECTO DEL NÚMERO
        if (!this.phoneNumber) {
            console.log(chalk.blue('📝 Ejemplo correcto: Si tu número es +52 33 1234 5678 → escribe: 523312345678'));
            console.log(chalk.blue('⚠️ Solo números, sin signos, espacios, guiones ni paréntesis\n'));
            console.log(chalk.yellow('💡 Para números de Estados Unidos/Canadá: Código país 1 + número = total 11 dígitos\n'));

            this.phoneNumber = await new Promise(resolve => {
                rl.question(
                    chalk.blue('📱 Ingresa tu número con código de país: '),
                    num => {
                        // ✨ PROCESAMIENTO ESPECIAL: lo convertimos al formato que pide WhatsApp
                        let numeroLimpio = num.replace(/\D/g, '');
                        // Nos aseguramos que no tenga el signo + y que tenga la longitud correcta
                        if (numeroLimpio.startsWith('+')) numeroLimpio = numeroLimpio.slice(1);
                        resolve(numeroLimpio);
                    }
                );
            });

            rl.close();

            // ✨ VALIDACIÓN EXACTA SEGÚN EL PAÍS
            if (!this.phoneNumber) {
                console.log(chalk.red.bold('❌ No ingresaste ningún número\n'));
                this.procesoActivo = false;
                this.phoneNumber = null;
                this.tipoVinculacion = null;
                return this.connect();
            }

            // Para tu caso: código 1 debe tener 11 dígitos
            if (this.phoneNumber.startsWith('1') && this.phoneNumber.length !== 11) {
                console.log(chalk.red.bold(`❌ Para tu número, debe tener 11 dígitos en total. Tú ingresaste ${this.phoneNumber.length}.\n`));
                console.log(chalk.yellow('Ejemplo correcto: 18549995761 ✅\n'));
                this.phoneNumber = null;
                this.tipoVinculacion = null;
                this.procesoActivo = false;
                return this.connect();
            }

            // Validación general para otros países
            if (this.phoneNumber.length < 10 || this.phoneNumber.length > 15) {
                console.log(chalk.red.bold('❌ El número no tiene la longitud correcta. Debe tener entre 10 y 15 dígitos incluyendo código de país\n'));
                this.phoneNumber = null;
                this.tipoVinculacion = null;
                this.procesoActivo = false;
                return this.connect();
            }

            console.log(chalk.yellow.bold(`⏳ Preparando conexión para: ${this.phoneNumber}\n`));
        }

        // 📌 CONFIGURACIÓN MEJORADA PARA QUE LOS CÓDIGOS SEAN VÁLIDOS
        const { state, saveCreds } = await useMultiFileAuthState('./auth_info');

        this.socket = makeWASocket({
            auth: state,
            syncFullHistory: false,
            logger: pino({ level: 'silent' }),
            markAsOnline: true,
            connectTimeoutMs: 180000,
            retryDelayMs: 2000,
            keepAliveIntervalMs: 10000,
            defaultQueryTimeoutMs: 90000,
            emitOwnEvents: false
        });

        this.socket.ev.on('creds.update', saveCreds);

        // 📌 MANEJO DE EVENTOS
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

                // SI YA TENEMOS EL CÓDIGO, NO HACEMOS NADA, SOLO ESPERAMOS
                if (this.codigoMostrado) {
                    console.log(chalk.yellow.bold('\n⏳ Esperando que ingreses el código... Por favor, hazlo rápido porque caduca\n'));
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

            // 🔢 OPCIÓN 1: CÓDIGO NUMÉRICO - AHORA GENERADO CORRECTAMENTE
            if (this.tipoVinculacion === '1' && !this.codigoMostrado) {
                try {
                    await new Promise(resolve => setTimeout(resolve, 3000));

                    if (code) {
                        this.mostrarCodigo(code);
                        return;
                    }

                    // ✨ AHORA ENVIAMOS EL NÚMERO EN EL FORMATO EXACTO QUE PIDE
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
                console.log(chalk.yellow('2. Escanea este código\n'));
                console.log(chalk.yellow('⌛ Esperando confirmación...\n'));
            }
        });

        return this.socket;
    }

    // 📌 FUNCIÓN PARA MOSTRAR EL CÓDIGO CON INSTRUCCIONES EXTRAS
    mostrarCodigo(codigo) {
        this.codigoMostrado = true;
        console.log(chalk.magenta.bold(`\n🔑 TU CÓDIGO DE VINCULACIÓN ES: ${chalk.white.bgBlack.bold(` ${codigo} `)}`));
        console.log(chalk.magenta('📋 PASOS PARA VINCULAR CORRECTAMENTE: ✅'));
        console.log(chalk.magenta('1. Abre WhatsApp en tu teléfono'));
        console.log(chalk.magenta('2. Ve a Ajustes ➝ Dispositivos vinculados ➝ Vincular dispositivo'));
        console.log(chalk.magenta('3. Selecciona la opción: "Vincular con número de teléfono"'));
        console.log(chalk.magenta('4. Ingresa SOLO los caracteres que aparecen, sin espacios ni nada más'));
        console.log(chalk.magenta('5. Escribe todo en MAYÚSCULAS, tal como te aparece aquí\n'));
        console.log(chalk.red.bold('⚠️ MUY IMPORTANTE: El código caduca en 2 minutos. Si no te funciona, cierra y vuelve a intentar\n'));
        console.log(chalk.green.bold('✅ CÓDIGO GENERADO. ESPERA MIENTRAS LO INGRESAS...\n'));
    }
        }
                    
